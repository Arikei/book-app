import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import BarcodeScanner from './BarcodeScanner'
import { supabase } from './supabaseClient'

function App() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]); // カテゴリー一覧
  const [inputText, setInputText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(""); // 選択中のカテゴリー
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false); // カテゴリー設定画面の開閉
  const [newCategoryName, setNewCategoryName] = useState(""); // 新規カテゴリー入力用
  const [filterText, setFilterText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [scanMessage, setScanMessage] = useState("");
  
  const lastScannedIsbnRef = useRef(null);
  const audioContextRef = useRef(null);

  // --- 1. データ取得関連 ---

  // 本の取得
  const fetchBooks = useCallback(async () => {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('Error:', error);
    else setBooks(data);
  }, []);

  // カテゴリーの取得
  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setCategories(data);
  }, []);

  useEffect(() => { 
    fetchBooks(); 
    fetchCategories();
  }, [fetchBooks, fetchCategories]);

  // --- 2. 統計データの計算 (useMemoで自動計算) ---
  const stats = useMemo(() => {
    return {
      unread: books.filter(b => b.status === '未読').length,
      reading: books.filter(b => b.status === '読書中').length,
      finished: books.filter(b => b.status === '読了').length,
      total: books.length
    };
  }, [books]);

  // --- 3. ロジック関連 ---

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

  const resetScanLock = useCallback(() => {
    setTimeout(() => {
      setScanMessage("");
      lastScannedIsbnRef.current = null;
    }, 3000);
  }, []);

  // 本の追加
  const addBookToDB = useCallback(async (bookData) => {
    let insertData = { status: '未読', category: selectedCategory || null }; // カテゴリーも含める

    if (typeof bookData === 'string') {
      insertData = { ...insertData, title: bookData };
    } else {
      insertData = {
        ...insertData,
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        cover_url: bookData.cover,
        isbn: bookData.isbn,
      };
    }

    // 重複チェック
    if (insertData.isbn) {
      const { data: existingBooks } = await supabase
        .from('books').select('id').eq('isbn', insertData.isbn);
      if (existingBooks && existingBooks.length > 0) {
        setScanMessage(`⚠️ 登録済み: ${insertData.title}`);
        playBeep(); resetScanLock(); return; 
      }
    }

    const { error } = await supabase.from('books').insert([insertData]);
    if (error) alert(`保存エラー: ${error.message}`);
    else fetchBooks();
  }, [fetchBooks, resetScanLock, playBeep, selectedCategory]);

  const handleAddBook = () => {
    if (inputText === "") return;
    addBookToDB(inputText);
    setInputText("");
  };

  // カテゴリー追加
  const handleAddCategory = async () => {
    if (!newCategoryName) return;
    const { error } = await supabase.from('categories').insert([{ name: newCategoryName }]);
    if (error) alert("追加エラー: " + error.message);
    else {
      setNewCategoryName("");
      fetchCategories();
    }
  };

  // カテゴリー削除
  const handleDeleteCategory = async (id) => {
    if(!confirm("このカテゴリーを削除しますか？")) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (!error) fetchCategories();
  };

  // 本の削除
  const handleDeleteBook = async (targetId) => {
    const { error } = await supabase.from('books').delete().eq('id', targetId);
    if (!error) fetchBooks();
  };

  // スキャン成功時
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
      
      // Google Books Fallback
      const resGoogle = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const dataGoogle = await resGoogle.json();
      if (dataGoogle.items && dataGoogle.items.length > 0) {
        const info = dataGoogle.items[0].volumeInfo;
        const googleBookData = {
          title: info.title || "タイトル不明",
          author: info.authors ? info.authors.join(', ') : '著者不明',
          publisher: info.publisher || '出版社不明',
          cover: (info.imageLinks?.thumbnail || '').replace('http://', 'https://'),
          isbn: isbn
        };
        await addBookToDB(googleBookData);
        showSuccessMessage(googleBookData.title);
      } else {
        setScanMessage("⚠️ 情報なし");
        resetScanLock();
      }
    } catch (error) {
      alert(`エラー: ${error.message}`); resetScanLock();
    }
  }, [addBookToDB, playBeep, showSuccessMessage, resetScanLock]);

  const handleStatusChange = async (id, newStatus) => {
    const updatedBooks = books.map(book => book.id === id ? { ...book, status: newStatus } : book);
    setBooks(updatedBooks);
    await supabase.from('books').update({ status: newStatus }).eq('id', id);
    fetchBooks(); // 再取得して整合性を保つ
  };
  
  const displayBooks = useMemo(() => {
    let filtered = books.filter(book => book.title.toLowerCase().includes(filterText.toLowerCase()));
    
    // カテゴリーでの絞り込みもここに追加可能だが、今回はテキスト検索のみ
    
    if (sortOrder === "newest") filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortOrder === "oldest") filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortOrder === "status") {
      const statusOrder = { "未読": 1, "読書中": 2, "読了": 3 };
      filtered.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
    }
    return filtered;
  }, [books, filterText, sortOrder]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 text-slate-700 font-sans pb-20">
      
      {/* ヘッダー & 統計表示 */}
      <div className="pt-8 pb-6 px-4 max-w-xl mx-auto">
        <h1 className="text-3xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 mb-6">
          My Library
        </h1>

        {/* 統計カード */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/60 backdrop-blur p-3 rounded-2xl shadow-sm border border-white text-center">
            <div className="text-xs text-slate-500 font-bold mb-1">未読</div>
            <div className="text-2xl font-black text-rose-500">{stats.unread}</div>
          </div>
          <div className="bg-white/60 backdrop-blur p-3 rounded-2xl shadow-sm border border-white text-center">
            <div className="text-xs text-slate-500 font-bold mb-1">読書中</div>
            <div className="text-2xl font-black text-amber-500">{stats.reading}</div>
          </div>
          <div className="bg-white/60 backdrop-blur p-3 rounded-2xl shadow-sm border border-white text-center">
            <div className="text-xs text-slate-500 font-bold mb-1">読了</div>
            <div className="text-2xl font-black text-emerald-500">{stats.finished}</div>
          </div>
        </div>

        {/* メインパネル */}
        <div className="bg-white/70 backdrop-blur-lg border border-white/50 rounded-3xl p-6 shadow-xl mb-6 relative">
          
          {/* カテゴリー設定ボタン */}
          <button 
            onClick={() => setIsCategoryModalOpen(!isCategoryModalOpen)}
            className="absolute top-4 right-4 text-slate-400 hover:text-violet-600 transition"
            title="カテゴリー設定"
          >
            ⚙️
          </button>

          {/* カテゴリー設定エリア (開閉式) */}
          {isCategoryModalOpen && (
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-600 mb-3">カテゴリー管理</h3>
              <div className="flex gap-2 mb-3">
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="新しいカテゴリー名"
                  className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <button onClick={handleAddCategory} className="bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-violet-600">追加</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <span key={cat.id} className="inline-flex items-center px-2 py-1 rounded bg-white border text-xs font-medium text-slate-600">
                    {cat.name}
                    <button onClick={() => handleDeleteCategory(cat.id)} className="ml-1 text-slate-400 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 追加フォーム */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="タイトルを入力..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button 
                onClick={handleAddBook} 
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg active:scale-95"
              >
                ＋
              </button>
            </div>
            
            {/* カテゴリー選択プルダウン */}
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 bg-white/50 border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="">カテゴリーなし (選択)</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsCameraOpen(!isCameraOpen)}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95
              ${isCameraOpen ? "bg-slate-700" : "bg-gradient-to-r from-cyan-500 to-blue-500"}`}
          >
            {isCameraOpen ? "📷 カメラを閉じる" : "📷 バーコードで追加"}
          </button>
          
          {scanMessage && (
            <div className={`mt-4 p-3 border rounded-xl text-center font-bold animate-bounce ${scanMessage.includes('⚠️') ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
              {scanMessage}
            </div>
          )}

          {isCameraOpen && (
            <div className="mt-6 overflow-hidden rounded-2xl shadow-inner border-4 border-slate-200">
              <BarcodeScanner onScan={handleScanSuccess} />
            </div>
          )}
        </div>
        
        {/* 検索・ソート */}
        <div className="flex gap-3 mb-6 items-center justify-between bg-white/40 p-2 rounded-2xl">
          <input
            type="text"
            placeholder="検索..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="flex-1 pl-4 pr-4 py-2 bg-transparent border-b border-slate-300 focus:border-violet-500 focus:outline-none"
          />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="text-sm bg-white/80 border-none rounded-lg px-3 py-2 text-slate-600"
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
              className={`group relative flex gap-4 p-4 rounded-2xl transition-all duration-300 hover:-translate-y-1 bg-white/80 backdrop-blur shadow-lg
                ${book.status === "読了" ? "opacity-75 grayscale-[0.5]" : ""}
              `}
            >
              <div className="flex-shrink-0 w-20 h-28 rounded-lg overflow-hidden shadow-md bg-slate-200">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">No Image</div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  {/* カテゴリーチップ */}
                  {book.category && (
                    <span className="inline-block px-2 py-0.5 mb-1 rounded bg-violet-100 text-violet-600 text-[10px] font-bold">
                      {book.category}
                    </span>
                  )}
                  <h3 className="text-base font-bold text-slate-800 leading-snug line-clamp-2">{book.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{book.author}</p>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <div className="relative">
                    <select 
                      value={book.status || "未読"} 
                      onChange={(e) => handleStatusChange(book.id, e.target.value)}
                      className={`appearance-none text-xs font-bold py-1.5 pl-3 pr-8 rounded-full cursor-pointer focus:outline-none
                        ${book.status === "未読" ? "bg-rose-100 text-rose-600" : ""}
                        ${book.status === "読書中" ? "bg-amber-100 text-amber-600" : ""}
                        ${book.status === "読了" ? "bg-emerald-100 text-emerald-600" : ""}
                      `}
                    >
                      <option value="未読">📕 未読</option>
                      <option value="読書中">📖 読書中</option>
                      <option value="読了">✅ 読了</option>
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-xs opacity-50">▼</div>
                  </div>

                  <button onClick={() => handleDeleteBook(book.id)} className="text-slate-300 hover:text-rose-500 transition">
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App