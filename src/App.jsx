import { useState, useEffect, useRef } from 'react'
import './App.css'
import BarcodeScanner from './BarcodeScanner'
import { supabase } from './supabaseClient'

function App() {
  const [books, setBooks] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  
  // ★追加: スキャン結果を表示するメッセージと、連続読み取り防止用
  const [scanMessage, setScanMessage] = useState("");
  const lastScannedIsbnRef = useRef(null); // 直前に読んだISBNを記憶

  // 1. データ取得
  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error('Error:', error);
    else setBooks(data);
  };

  // ★ 音を鳴らす関数 (Web Audio API)
  const playBeep = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine'; // 音の種類（正弦波）
    oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // 高さ(Hz)
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // 音量
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1); // 0.1秒で止める
  };

  // 2. 追加機能
  const addBookToDB = async (bookData) => {
    let insertData = { status: '未読' };

    if (typeof bookData === 'string') {
      insertData = { ...insertData, title: bookData };
    } else {
      insertData = {
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        cover_url: bookData.cover,
        isbn: bookData.isbn,
        status: '未読'
      };
    }

    const { error } = await supabase.from('books').insert([insertData]);

    if (error) {
      console.error('Error:', error);
      // エラー時は音を変えてもいいですが、今回はアラートのみ
    } else {
      fetchBooks();
    }
  };

  const handleAddBook = () => {
    if (inputText === "") return;
    addBookToDB(inputText);
    setInputText("");
  };

  const handleDeleteBook = async (targetId) => {
    const { error } = await supabase.from('books').delete().eq('id', targetId);
    if (error) console.error('Error:', error);
    else fetchBooks();
  };

  // ★ 4. スキャン成功時の処理（大幅改良）
  const handleScanSuccess = async (isbn) => {
    // 直前に読んだ本と同じなら無視する（連続反応防止）
    if (lastScannedIsbnRef.current === isbn) {
      return; 
    }

    if (!isbn.startsWith("978")) {
      return; // ISBN以外は静かに無視
    }

    // 新しいISBNを記憶
    lastScannedIsbnRef.current = isbn;
    
    // 音を鳴らす！
    playBeep();

    try {
      const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      const data = await response.json();

      if (data[0] && data[0].summary) {
        const bookInfo = data[0].summary;
        
        // DBに追加
        await addBookToDB(bookInfo);
        
        // 画面に「追加しました」と出す（アラートではなく画面表示）
        setScanMessage(`✅ 追加: ${bookInfo.title}`);
        
        // 3秒後にメッセージを消し、連続読み取りロックを解除
        setTimeout(() => {
          setScanMessage("");
          lastScannedIsbnRef.current = null; // 3秒経てば同じ本でもまた登録できるようにする
        }, 3000);

      } else {
        setScanMessage("⚠️ 書籍情報が見つかりませんでした");
      }
    } catch (error) {
      console.error("検索エラー:", error);
    }
  }

  const handleStatusChange = async (id, newStatus) => {
    const updatedBooks = books.map(book =>
      book.id === id ? { ...book, status: newStatus } : book
    );
    setBooks(updatedBooks);

    const { error } = await supabase
      .from('books')
      .update({ status: newStatus })
      .eq('id', id);
    
    if (error) {
      console.error('Error updating status:', error);
      fetchBooks();
    }
  };
  
  const getDisplayBooks = () => {
    let filtered = books.filter(book =>
      book.title.toLowerCase().includes(filterText.toLowerCase())
    );
  
    if (sortOrder === "newest") {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortOrder === "oldest") {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortOrder === "status") {
      const statusOrder = { "未読": 1, "読書中": 2, "読了": 3 };
      filtered.sort((a, b) =>
        (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)
      );
    }
    return filtered;
  };

  const displayBooks = getDisplayBooks();

  return (
    <>
      <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
        {/* ★修正: タイトルの色を黒(#333)に指定 */}
        <h1 style={{ color: "#333" }}>書籍リスト管理 (Scanner v2)</h1>

        {/* 入力エリア */}
        <div style={{ marginBottom: "30px" }}>
          <input
            type="text"
            placeholder="タイトルを手動入力"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ padding: "8px", width: "60%" }}
          />
          <button onClick={handleAddBook} style={{ marginLeft: "5px", padding: "8px 15px" }}>追加</button>
        </div>

        {/* カメラボタン & スキャンメッセージ */}
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setIsCameraOpen(!isCameraOpen)}
            style={{ 
              backgroundColor: isCameraOpen ? "#ff9800" : "#4CAF50", // 開いているときはオレンジ色に
              color: "white", padding: "10px", border: "none", cursor: "pointer", width: "100%", borderRadius: "5px", fontSize: "16px", fontWeight: "bold" 
            }}
          >
            {isCameraOpen ? "カメラを停止する" : "📷 連続スキャンモード開始"}
          </button>
          
          {/* スキャン中のメッセージ表示エリア */}
          {scanMessage && (
            <div style={{
              marginTop: "10px", padding: "10px", backgroundColor: "#e0f7fa", 
              color: "#006064", borderRadius: "5px", fontWeight: "bold"
            }}>
              {scanMessage}
            </div>
          )}

          {isCameraOpen && (
            <div style={{ marginTop: "10px" }}>
              <BarcodeScanner onScan={handleScanSuccess} />
              <p style={{ fontSize: "12px", color: "#666" }}>カメラをバーコードに向け続けてください（連続登録可能）</p>
            </div>
          )}
        </div>
        
        {/* 検索・並び替えエリア */}
        <div style={{marginBottom:"20px", padding:"15px", backgroundColor:"#f5f5f5", borderRadius:"8px"}}>
          <div style={{marginBottom:"10px"}}>
            <label style={{ color: "#333" }}>🔍 検索: </label>
            <input
              type="text"
              placeholder="タイトルで絞り込み"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{width:"70%", padding:"5px"}}
            />
          </div>
          <div>
            <label style={{ color: "#333" }}>⇅ 並び替え: </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{padding:"5px"}}
            >
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
              <option value="status">ステータス順</option>
            </select>
          </div>
        </div>

        {/* リスト表示エリア */}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {displayBooks.map((book) => (
            <li key={book.id} style={{
              borderBottom: "1px solid #ddd",
              padding: "15px",
              display: "flex",
              alignItems: "flex-start",
              gap: "15px",
              backgroundColor: book.status === "読了" ? "#f0f8ff" : "#fff" 
            }}>
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} style={{ width: "60px", boxShadow: "2px 2px 5px rgba(0,0,0,0.2)" }} />
              ) : (
                <div style={{ width: "60px", height: "80px", backgroundColor: "#eee", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:"#888" }}>No Image</div>
              )}

              <div style={{ flex: 1, textAlign: "left" }}>
                <h3 style={{ margin: "0 0 5px 0", fontSize: "16px", color: "#333" }}>{book.title}</h3>
                <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#555" }}>
                  {book.author}
                </p>

                <div style={{ marginBottom: "10px" }}>
                  <select 
                    value={book.status || "未読"} 
                    onChange={(e) => handleStatusChange(book.id, e.target.value)}
                    style={{ 
                      padding: "5px", 
                      borderRadius: "4px",
                      backgroundColor: book.status === "読書中" ? "#fffacd" : (book.status === "読了" ? "#e0ffff" : "#fff")
                    }}
                  >
                    <option value="未読">📕 未読</option>
                    <option value="読書中">📖 読書中</option>
                    <option value="読了">✅ 読了</option>
                  </select>
                </div>

                <button
                  onClick={() => handleDeleteBook(book.id)}
                  style={{ backgroundColor: "#ff4d4d", color: "white", border: "none", padding: "5px 10px", cursor: "pointer", borderRadius: "4px", fontSize: "12px" }}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default App