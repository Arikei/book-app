import { useState, useEffect } from 'react'
import './App.css'
import BarcodeScanner from './BarcodeScanner'
import { supabase } from './supabaseClient'

function App() {
  const [books, setBooks] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);

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
  // bookData は「文字列(タイトルのみ)」か「オブジェクト(詳細情報)」のどちらかが来る
  const addBookToDB = async (bookData) => {
    let insertData = {};

    if (typeof bookData === 'string') {
      // 手動入力の場合（タイトルだけ保存）
      insertData = { title: bookData };
    } else {
      // スキャンの場合（全データを保存）
      insertData = {
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        cover_url: bookData.cover,
        isbn: bookData.isbn
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
        // APIから返ってきたデータ全体を取得
        const bookInfo = data[0].summary;
        
        // 詳細情報オブジェクトをDB保存関数に渡す
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

  return (
    <>
      <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
        <h1>書籍リスト管理 (詳細版)</h1>

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

        {/* リスト表示エリア */}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {books.map((book) => (
            <li key={book.id} style={{
              borderBottom: "1px solid #ddd",
              padding: "15px",
              display: "flex", // 横並びにする
              alignItems: "flex-start", // 上揃え
              gap: "15px", // 画像と文字の間隔
              backgroundColor: "#fff"
            }}>
              {/* 表紙画像があれば表示 */}
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} style={{ width: "60px", boxShadow: "2px 2px 5px rgba(0,0,0,0.2)" }} />
              ) : (
                <div style={{ width: "60px", height: "80px", backgroundColor: "#eee", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:"#888" }}>No Image</div>
              )}

              {/* 書籍情報 */}
              <div style={{ flex: 1, textAlign: "left" }}>
                <h3 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>{book.title}</h3>
                
                {/* 著者と出版社を表示 */}
                <p style={{ margin: "0", fontSize: "14px", color: "#555" }}>
                  {book.author ? `著者: ${book.author}` : "著者不明"}
                </p>
                <p style={{ margin: "0", fontSize: "12px", color: "#888" }}>
                  {book.publisher ? `出版社: ${book.publisher}` : ""}
                </p>
              </div>

              {/* 削除ボタン */}
              <button
                onClick={() => handleDeleteBook(book.id)}
                style={{ backgroundColor: "#ff4d4d", color: "white", border: "none", padding: "5px 10px", cursor: "pointer", borderRadius: "4px", alignSelf: "center" }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default App