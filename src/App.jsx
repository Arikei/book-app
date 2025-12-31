import { useState, useEffect } from 'react'
import './App.css'
import BarcodeScanner from './BarcodeScanner'
import { supabase } from './supabaseClient'

function App() {
  const [books, setBooks] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  // 1. データ取得
  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    // データを取得（新しいカラムも全部取得されます）
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false }); // 新しい順に表示

    if (error) console.error('Error:', error);
    else setBooks(data);
  };

  // 2. 追加機能（共通）
  const addBookToDB = async (bookData) => {
    let insertData = { status: '未読' }; // デフォルト

    if (typeof bookData === 'string') {
      // 手動入力の場合（タイトルだけ保存）
      insertData = { ...insertData, title: bookData };
    } else {
      // スキャンの場合（全データを保存）
      insertData = {
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        cover_url: bookData.cover,
        isbn: bookData.isbn,
        status: '未読'
      };
    }

    const { error } = await supabase
      .from('books')
      .insert([insertData]);

    if (error) {
      console.error('Error:', error);
      alert("追加に失敗しました");
    } else {
      fetchBooks();
    }
  };

  // 手動追加ボタン用
  const handleAddBook = () => {
    if (inputText === "") return;
    addBookToDB(inputText); // タイトルだけ渡す
    setInputText("");
  };

  // 3. 削除機能
  const handleDeleteBook = async (targetId) => {
    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', targetId);

    if (error) {
      console.error('Error:', error);
    } else {
      fetchBooks();
    }
  };

  // 4. スキャン成功時の処理
  const handleScanSuccess = async (isbn) => {
    setIsCameraOpen(false);
    if (!isbn.startsWith("978")) {
      alert("ISBNではありませんでした");
      return;
    }

    try {
      const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      const data = await response.json();

      if (data[0] && data[0].summary) {
        const bookInfo = data[0].summary;
        addBookToDB(bookInfo);
        alert(`「${bookInfo.title}」を追加しました!`);
      } else {
        alert("該当する書籍が見つかりませんでした。");
      }
    } catch (error) {
      console.error("検索エラー:", error);
      alert("書籍情報の取得に失敗しました。");
    }
  }

  // ★ 5. ステータス変更機能
  const handleStatusChange = async (id, newStatus) => {
    // 画面の表示を即座に更新（サクサク感のため）
    const updatedBooks = books.map(book =>
      book.id === id ? { ...book, status: newStatus } : book
    );
    setBooks(updatedBooks); // ★ここを修正しました (updateBooks -> updatedBooks)

    // DB更新
    const { error } = await supabase
      .from('books')
      .update({ status: newStatus })
      .eq('id', id);
    
    if (error) {
      console.error('Error updating status:', error);
      alert("ステータスの更新に失敗しました");
      fetchBooks(); // 失敗したら元に戻す
    }
  };
  
  // ★ 6. 検索・並び替えロジック
  const getDisplayBooks = () => {
    let filtered = books.filter(book =>
      book.title.toLowerCase().includes(filterText.toLowerCase())
    );
  
    if (sortOrder === "newest") {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortOrder === "oldest") {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // ★ここを修正しました (a,created -> a.created)
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
        <h1>書籍リスト管理 (Status付)</h1>

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

        {/* カメラボタン */}
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setIsCameraOpen(!isCameraOpen)}
            style={{ backgroundColor: "#4CAF50", color: "white", padding: "10px", border: "none", cursor: "pointer", width: "100%", borderRadius: "5px", fontSize: "16px" }}
          >
            {isCameraOpen ? "カメラを閉じる" : "📷 カメラでISBNを読み取る"}
          </button>
          {isCameraOpen && (
            <BarcodeScanner onScan={handleScanSuccess} />
          )}
        </div>
        
        {/* 検索・並び替えエリア */}
        <div style={{marginBottom:"20px", padding:"15px", backgroundColor:"#f5f5f5", borderRadius:"8px"}}>
          <div style={{marginBottom:"10px"}}>
            <label>🔍 検索: </label>
            <input
              type="text"
              placeholder="タイトルで絞り込み"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{width:"70%", padding:"5px"}}
            />
          </div>
          <div>
            <label>⇅ 並び替え: </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{padding:"5px"}} // ★修正 (paddings -> padding)
            >
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option> {/* ★修正 (opiton -> option) */}
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
              {/* 画像 */}
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} style={{ width: "60px", boxShadow: "2px 2px 5px rgba(0,0,0,0.2)" }} />
              ) : (
                <div style={{ width: "60px", height: "80px", backgroundColor: "#eee", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:"#888" }}>No Image</div>
              )}

              {/* 書籍情報とコントロール */}
              <div style={{ flex: 1, textAlign: "left" }}>
                <h3 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>{book.title}</h3>
                <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#555" }}>
                  {book.author}
                </p>

                {/* ステータス選択プルダウン */}
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