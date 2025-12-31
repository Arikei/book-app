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
  
  const [scanMessage, setScanMessage] = useState("");
  const lastScannedIsbnRef = useRef(null);

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

  const playBeep = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  };

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

  // ★ここが今回の改造のメイン！「ハイブリッド検索」
  const handleScanSuccess = async (isbn) => {
    if (lastScannedIsbnRef.current === isbn) return;
    if (!isbn.startsWith("978")) return;

    lastScannedIsbnRef.current = isbn;
    playBeep();

    try {
      // ---------------------------------------------------
      // 作戦1: まず OpenBD を探す (データが綺麗なので優先)
      // ---------------------------------------------------
      const resOpenBD = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      const dataOpenBD = await resOpenBD.json();

      if (dataOpenBD[0] && dataOpenBD[0].summary) {
        // OpenBDで見つかった場合
        const bookInfo = dataOpenBD[0].summary;
        await addBookToDB(bookInfo);
        showSuccessMessage(bookInfo.title);
        return; // ここで終了（Google Booksには行かない）
      }

      // ---------------------------------------------------
      // 作戦2: Google Books API を探す (OpenBDダメだった場合)
      // ---------------------------------------------------
      const resGoogle = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const dataGoogle = await resGoogle.json();

      if (dataGoogle.items && dataGoogle.items.length > 0) {
        // Googleで見つかった場合
        const info = dataGoogle.items[0].volumeInfo;
        
        // GoogleのデータをOpenBDの形式に合わせる（正規化）
        const googleBookData = {
          title: info.title,
          author: info.authors ? info.authors.join(', ') : '不明', // 配列を文字列に
          publisher: info.publisher || '不明',
          // 画像URLの http を https に変換（セキュリティ警告防止）
          cover: info.imageLinks ? info.imageLinks.thumbnail.replace('http://', 'https://') : '',
          isbn: isbn
        };

        await addBookToDB(googleBookData);
        showSuccessMessage(googleBookData.title);

      } else {
        // ---------------------------------------------------
        // どちらもダメだった場合
        // ---------------------------------------------------
        setScanMessage("⚠️ 書籍情報が見つかりませんでした");
        setTimeout(() => {
            setScanMessage("");
            lastScannedIsbnRef.current = null;
        }, 3000);
      }

    } catch (error) {
      console.error("検索エラー:", error);
      setScanMessage("⚠️ 検索中にエラーが発生しました");
    }
  }

  // メッセージ表示用の便利関数
  const showSuccessMessage = (title) => {
    setScanMessage(`✅ 追加: ${title}`);
    setTimeout(() => {
      setScanMessage("");
      lastScannedIsbnRef.current = null;
    }, 3000);
  };

  const handleStatusChange = async (id, newStatus) => {
    const updatedBooks = books.map(book =>
      book.id === id ? { ...book, status: newStatus } : book
    );
    setBooks(updatedBooks);
    const { error } = await supabase
      .from('books').update({ status: newStatus }).eq('id', id);
    if (error) fetchBooks();
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
        <h1 style={{ color: "#333" }}>書籍リスト管理 (Hybrid Search)</h1>

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

        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setIsCameraOpen(!isCameraOpen)}
            style={{ 
              backgroundColor: isCameraOpen ? "#ff9800" : "#4CAF50",
              color: "white", padding: "10px", border: "none", cursor: "pointer", width: "100%", borderRadius: "5px", fontSize: "16px", fontWeight: "bold" 
            }}
          >
            {isCameraOpen ? "カメラを停止する" : "📷 連続スキャンモード開始"}
          </button>
          
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
              <p style={{ fontSize: "12px", color: "#666" }}>Google Booksと連携中。古い本も試してみてください。</p>
            </div>
          )}
        </div>
        
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