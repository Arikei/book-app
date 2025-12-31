import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  const audioContextRef = useRef(null);

  // --- ロジック部分は変更なし ---
  const fetchBooks = useCallback(async () => {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('Error:', error);
    else setBooks(data);
  }, []);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const playBeep = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) { console.log("音再生失敗", e); }
  }, []);

  const addBookToDB = useCallback(async (bookData) => {
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
    if (error) { alert(`保存エラー: ${error.message}`); }
    else { fetchBooks(); }
  }, [fetchBooks]);

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

  const resetScanLock = useCallback(() => {
    setTimeout(() => {
      setScanMessage("");
      lastScannedIsbnRef.current = null;
    }, 3000);
  }, []);

  const showSuccessMessage = useCallback((title) => {
    setScanMessage(`✅ 追加: ${title}`);
    resetScanLock();
  }, [resetScanLock]);

  const handleScanSuccess = useCallback(async (isbn) => {
    if (lastScannedIsbnRef.current === isbn) return;
    if (!isbn.match(/^(978|979)/)) return;
    lastScannedIsbnRef.current = isbn;
    playBeep();

    try {
      const resOpenBD = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      const dataOpenBD = await resOpenBD.json();
      if (dataOpenBD[0] && dataOpenBD[0].summary) {
        const bookInfo = dataOpenBD[0].summary;
        await addBookToDB(bookInfo);
        showSuccessMessage(bookInfo.title);
        return;
      }

      const resGoogle = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const dataGoogle = await resGoogle.json();
      if (dataGoogle.items && dataGoogle.items.length > 0) {
        const info = dataGoogle.items[0].volumeInfo;
        const coverImage = (info.imageLinks && info.imageLinks.thumbnail) ? info.imageLinks.thumbnail.replace('http://', 'https://') : '';
        const googleBookData = {
          title: info.title || "タイトル不明",
          author: info.authors ? info.authors.join(', ') : '著者不明',
          publisher: info.publisher || '出版社不明',
          cover: coverImage,
          isbn: isbn
        };
        await addBookToDB(googleBookData);
        showSuccessMessage(googleBookData.title);
      } else {
        setScanMessage("⚠️ 情報が見つかりませんでした");
        resetScanLock();
      }
    } catch (error) {
      alert(`エラー: ${error.message}`); 
      resetScanLock();
    }
  }, [addBookToDB, playBeep, showSuccessMessage, resetScanLock]);

  const handleStatusChange = async (id, newStatus) => {
    const updatedBooks = books.map(book => book.id === id ? { ...book, status: newStatus } : book);
    setBooks(updatedBooks);
    const { error } = await supabase.from('books').update({ status: newStatus }).eq('id', id);
    if (error) fetchBooks();
  };
  
  const displayBooks = useMemo(() => {
    let filtered = books.filter(book => book.title.toLowerCase().includes(filterText.toLowerCase()));
    if (sortOrder === "newest") filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortOrder === "oldest") filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortOrder === "status") {
      const statusOrder = { "未読": 1, "読書中": 2, "読了": 3 };
      filtered.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
    }
    return filtered;
  }, [books, filterText, sortOrder]);

  // --- ここからデザイン部分 ---

  return (
    // 背景: 全体に淡いグラデーションをかける
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 text-slate-700 font-sans pb-20">
      
      {/* ヘッダーエリア */}
      <div className="pt-10 pb-6 px-4">
        <h1 className="text-4xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 drop-shadow-sm mb-2">
          My Library
        </h1>
        <p className="text-center text-slate-500 text-sm">読書記録をもっと楽しく</p>
      </div>

      <div className="max-w-xl mx-auto px-4">
        
        {/* メインコントロールパネル (すりガラス風) */}
        <div className="bg-white/70 backdrop-blur-lg border border-white/50 rounded-3xl p-6 shadow-xl mb-8">
          
          {/* 追加フォーム */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="タイトルを入力..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:bg-white transition placeholder-slate-400"
            />
            <button 
              onClick={handleAddBook} 
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-violet-200 transition-all active:scale-95"
            >
              ＋
            </button>
          </div>

          {/* カメラボタン */}
          <button
            onClick={() => setIsCameraOpen(!isCameraOpen)}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex justify-center items-center gap-2
              ${isCameraOpen 
                ? "bg-slate-700 hover:bg-slate-800" 
                : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-cyan-200"}`}
          >
            {isCameraOpen ? "📷 カメラを閉じる" : "📷 バーコードで追加"}
          </button>
          
          {/* スキャンメッセージ */}
          {scanMessage && (
            <div className="mt-4 p-3 bg-emerald-50/90 text-emerald-700 border border-emerald-100 rounded-xl text-center font-bold animate-bounce">
              {scanMessage}
            </div>
          )}

          {/* カメラ表示エリア */}
          {isCameraOpen && (
            <div className="mt-6 overflow-hidden rounded-2xl shadow-inner border-4 border-slate-200">
              <BarcodeScanner onScan={handleScanSuccess} />
            </div>
          )}
        </div>
        
        {/* 検索・ソートバー */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 items-center justify-between bg-white/40 p-2 rounded-2xl">
          <div className="relative w-full sm:w-auto flex-1">
            <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
            <input
              type="text"
              placeholder="本を探す..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-transparent border-b border-slate-300 focus:border-violet-500 focus:outline-none transition"
            />
          </div>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="text-sm bg-white/80 border-none rounded-lg px-3 py-2 text-slate-600 shadow-sm focus:ring-2 focus:ring-violet-200 cursor-pointer"
          >
            <option value="newest">📅 新しい順</option>
            <option value="oldest">📅 古い順</option>
            <option value="status">🔖 状態で並替</option>
          </select>
        </div>

        {/* 書籍リスト */}
        <div className="space-y-4">
          {displayBooks.map((book) => (
            <div 
              key={book.id} 
              className={`group relative flex gap-4 p-4 rounded-2xl transition-all duration-300 hover:-translate-y-1
                ${book.status === "読了" ? "bg-slate-100/80 opacity-75 grayscale-[0.5]" : "bg-white/80 backdrop-blur shadow-lg shadow-indigo-100/50 hover:shadow-xl hover:shadow-indigo-200/50"}
                ${book.status === "読書中" ? "ring-2 ring-amber-300 bg-amber-50/50" : ""}
              `}
            >
              {/* 表紙画像 (浮き出るような影) */}
              <div className="flex-shrink-0 w-24 h-32 rounded-lg overflow-hidden shadow-md group-hover:shadow-lg transition">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-200 flex items-center justify-center text-xs text-slate-400">No Image</div>
                )}
              </div>

              {/* 書籍情報 */}
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 leading-snug mb-1 line-clamp-2">{book.title}</h3>
                  <p className="text-sm text-slate-500">{book.author}</p>
                </div>

                <div className="flex justify-between items-center mt-3">
                  {/* ステータスバッジ */}
                  <div className="relative">
                    <select 
                      value={book.status || "未読"} 
                      onChange={(e) => handleStatusChange(book.id, e.target.value)}
                      className={`appearance-none text-xs font-bold py-1.5 pl-3 pr-8 rounded-full cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-offset-1
                        ${book.status === "未読" ? "bg-rose-100 text-rose-600 hover:bg-rose-200" : ""}
                        ${book.status === "読書中" ? "bg-amber-100 text-amber-600 hover:bg-amber-200" : ""}
                        ${book.status === "読了" ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200" : ""}
                      `}
                    >
                      <option value="未読">📕 未読</option>
                      <option value="読書中">📖 読書中</option>
                      <option value="読了">✅ 読了</option>
                    </select>
                    {/* カスタム矢印 */}
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-xs opacity-50">
                      ▼
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteBook(book.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-rose-500 transition"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}

          {displayBooks.length === 0 && (
            <div className="text-center py-16 opacity-50">
              <div className="text-6xl mb-4">📚</div>
              <p className="text-lg">本棚は空っぽです</p>
              <p className="text-sm">バーコードをスキャンして追加しよう</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App