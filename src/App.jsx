import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import BarcodeScanner from './BarcodeScanner'
import { supabase } from './supabaseClient'

function App() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]); 
  const [inputText, setInputText] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [filterText, setFilterText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [scanMessage, setScanMessage] = useState("");
  
  const lastScannedIsbnRef = useRef(null);
  const audioContextRef = useRef(null);

  // --- データ取得 ---
  const fetchBooks = useCallback(async () => {
    // category 列も含めて取得
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('Error fetching books:', error);
    else setBooks(data);
  }, []);

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

  // --- 統計 ---
  const stats = useMemo(() => {
    return {
      unread: books.filter(b => b.status === '未読').length,
      reading: books.filter(b => b.status === '読書中').length,
      finished: books.filter(b => b.status === '読了').length,
    };
  }, [books]);

  // --- 機能ロジック ---
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
    let insertData = { status: '未読', category: null };

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

    if (insertData.isbn) {
      const { data: existingBooks } = await supabase.from('books').select('id').eq('isbn', insertData.isbn);
      if (existingBooks && existingBooks.length > 0) {
        setScanMessage(`⚠️ 登録済み: ${insertData.title}`);
        playBeep(); resetScanLock(); return; 
      }
    }

    const { error } = await supabase.from('books').insert([insertData]);
    if (error) alert(`保存エラー: ${error.message}`);
    else fetchBooks();
  }, [fetchBooks, resetScanLock, playBeep]);

  const handleAddBook = () => {
    if (inputText === "") return;
    addBookToDB(inputText);
    setInputText("");
  };

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
  }, [addBookToDB, playBeep, resetScanLock]);

  const showSuccessMessage = (title) => {
    setScanMessage(`✅ 追加: ${title}`);
    resetScanLock();
  };

  const handleDeleteBook = async (targetId) => {
    const { error } = await supabase.from('books').delete().eq('id', targetId);
    if (!error) fetchBooks();
  };

  // カテゴリー管理
  const handleAddCategory = async () => {
    if (!newCategoryName) return;
    const { error } = await supabase.from('categories').insert([{ name: newCategoryName }]);
    if (error) alert("追加エラー: " + error.message);
    else {
      setNewCategoryName("");
      fetchCategories();
    }
  };

  const handleDeleteCategory = async (id) => {
    if(!confirm("削除しますか？")) return;
    await supabase.from('categories').delete().eq('id', id);
    fetchCategories();
  };

  // ★ステータス更新
  const handleStatusChange = async (id, newStatus) => {
    const updatedBooks = books.map(book => book.id === id ? { ...book, status: newStatus } : book);
    setBooks(updatedBooks);
    await supabase.from('books').update({ status: newStatus }).eq('id', id);
  };

  // ★カテゴリー更新（ここが重要）
  const handleCategoryChange = async (id, newCategory) => {
    // 画面上の表示を即時更新
    const updatedBooks = books.map(book => book.id === id ? { ...book, category: newCategory } : book);
    setBooks(updatedBooks);
    
    // DB更新 (空文字ならnullにする)
    const valueToSave = newCategory === "" ? null : newCategory;
    const { error } = await supabase.from('books').update({ category: valueToSave }).eq('id', id);
    
    if (error) {
      console.error("Update error:", error);
      alert("更新できませんでした。Supabaseにcategoryカラムがあるか確認してください。");
    }
  };

  // 表示用データ
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-20">
      
      {/* ヘッダー */}
      <div className="pt-8 pb-6 px-4 max-w-xl mx-auto">
        <h1 className="text-3xl font-extrabold text-center text-indigo-600 mb-6">My Library</h1>

        {/* 統計 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white p-3 rounded-2xl shadow-sm text-center border border-slate-100">
            <div className="text-xs text-slate-400 font-bold">未読</div>
            <div className="text-xl font-black text-rose-500">{stats.unread}</div>
          </div>
          <div className="bg-white p-3 rounded-2xl shadow-sm text-center border border-slate-100">
            <div className="text-xs text-slate-400 font-bold">読書中</div>
            <div className="text-xl font-black text-amber-500">{stats.reading}</div>
          </div>
          <div className="bg-white p-3 rounded-2xl shadow-sm text-center border border-slate-100">
            <div className="text-xs text-slate-400 font-bold">読了</div>
            <div className="text-xl font-black text-emerald-500">{stats.finished}</div>
          </div>
        </div>

        {/* メインエリア */}
        <div className="bg-white rounded-3xl p-6 shadow-xl mb-6 relative border border-slate-100">
          
          {/* カテゴリー設定ボタン */}
          <button 
            onClick={() => setIsCategoryModalOpen(!isCategoryModalOpen)}
            className="absolute top-4 right-4 text-slate-400 hover:text-indigo-600 bg-slate-50 p-2 rounded-full transition"
          >
            ⚙️ カテゴリー編集
          </button>

          {/* カテゴリー設定モーダル */}
          {isCategoryModalOpen && (
            <div className="mt-8 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-600 mb-3">カテゴリーを作る</h3>
              <div className="flex gap-2 mb-3">
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="例：技術書、小説..."
                  className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button onClick={handleAddCategory} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold">追加</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <span key={cat.id} className="inline-flex items-center px-2 py-1 rounded bg-white border shadow-sm text-xs font-medium text-slate-600">
                    {cat.name}
                    <button onClick={() => handleDeleteCategory(cat.id)} className="ml-1 text-slate-300 hover:text-rose-500 font-bold">×</button>
                  </span>
                ))}
                {categories.length === 0 && <span className="text-xs text-slate-400">まだカテゴリーがありません</span>}
              </div>
            </div>
          )}

          {/* 入力フォーム */}
          <div className="flex gap-2 mb-4 mt-8">
            <input
              type="text"
              placeholder="タイトル手動入力..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={handleAddBook} className="bg-indigo-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg active:scale-95">＋</button>
          </div>

          <button
            onClick={() => setIsCameraOpen(!isCameraOpen)}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2
              ${isCameraOpen ? "bg-slate-700" : "bg-gradient-to-r from-cyan-500 to-blue-500"}`}
          >
            {isCameraOpen ? "📷 カメラを閉じる" : "📷 バーコードで追加"}
          </button>
          
          {scanMessage && (
            <div className="mt-4 p-3 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-center font-bold">
              {scanMessage}
            </div>
          )}

          {isCameraOpen && (
            <div className="mt-6 overflow-hidden rounded-2xl bg-black border-4 border-slate-100">
              <BarcodeScanner onScan={handleScanSuccess} />
            </div>
          )}
        </div>

        {/* 検索ソート */}
        <div className="flex gap-3 mb-6 items-center justify-between px-2">
          <input
            type="text"
            placeholder="本を検索..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="flex-1 px-3 py-2 bg-transparent border-b border-slate-300 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 shadow-sm"
          >
            <option value="newest">新しい順</option>
            <option value="oldest">古い順</option>
            <option value="status">状態順</option>
          </select>
        </div>

        {/* --- 本のリスト --- */}
        <div className="space-y-4">
          {displayBooks.map((book) => (
            <div key={book.id} className="bg-white p-4 rounded-2xl shadow-md border border-slate-100 flex gap-4">
              
              {/* 表紙 */}
              <div className="flex-shrink-0 w-20 h-28 rounded-lg overflow-hidden bg-slate-200 shadow-sm">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">No Img</div>
                )}
              </div>

              {/* 情報エリア */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 leading-snug line-clamp-2">{book.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{book.author}</p>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  
                  {/* 1. ステータス選択 */}
                  <div className="flex items-center justify-between">
                    <select 
                      value={book.status || "未読"} 
                      onChange={(e) => handleStatusChange(book.id, e.target.value)}
                      className={`text-xs font-bold py-1 px-2 rounded cursor-pointer focus:outline-none border
                        ${book.status === "未読" ? "bg-rose-50 text-rose-600 border-rose-200" : ""}
                        ${book.status === "読書中" ? "bg-amber-50 text-amber-600 border-amber-200" : ""}
                        ${book.status === "読了" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : ""}
                      `}
                    >
                      <option value="未読">📕 未読</option>
                      <option value="読書中">📖 読書中</option>
                      <option value="読了">✅ 読了</option>
                    </select>

                    <button onClick={() => handleDeleteBook(book.id)} className="text-slate-300 hover:text-rose-500">🗑️</button>
                  </div>

                  {/* 2. カテゴリー選択 (ここをしっかりと追加) */}
                  <div>
                    <select
                      value={book.category || ""}
                      onChange={(e) => handleCategoryChange(book.id, e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded p-1 bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none"
                    >
                      <option value="">📂 カテゴリーなし</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                </div>
              </div>
            </div>
          ))}

          {displayBooks.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              <p>本がありません</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default App