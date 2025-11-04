// script.js

// ========================================
// ファイルハンドル管理
// ========================================
let fileHandles = {
  progress: null,
  settings: null,
  sessions: null,
  data: null,
  debug: null
};

// ========================================
// グローバル変数
// ========================================
let allWords = [];
let quizQueue = [];
let currentIndex = 0;
let currentWord = null;
let progressData = {};
let wrongList = [];
let newWordCount = 10;
let reviewWordCount = 10;
let correctCount = 0; // 正解した問題数を追跡
let questionFontSize = 32; // 追加: 問題文フォントサイズ
let debugMode = false; // デバッグ表示フラグ
let sessionStartTime = null;
let sessionEndTime = null;
let questionTimes = []; // 問題ごとの所要時間を記録
let lastQuestionTime = null; // 最後の問題の開始時刻
let sessionWrongCounts = {}; // 一回のセッションでの間違い数を追跡
let debug = true;
let dataJsonFileHandle = null; // data.jsonのファイルハンドルを保持（互換性のため残す）
let lastDebugSaveTime = Date.now(); // 最後にdebug.jsonを保存した時刻
let lastDebugLogCount = 0; // 最後に保存した時のログ数
let debugInfoMaxCount = 5; // デバッグ情報の最大表示数（デフォルト5件）

// ========================================
// ファイル読み書き汎用関数
// ========================================

// JSONファイルを読み込む汎用関数（ファイル選択なし版）
async function readJsonFile(fileName, fileHandleKey, skipPicker = false) {
  const log = (msg) => console.log(`[readJsonFile] ${msg}`);
  
  try {
    const protocol = window.location.protocol;
    
    // まずファイルハンドルがあるかチェック
    let fileHandle = fileHandles[fileHandleKey];
    
    // ファイルハンドルがある場合はそれを使用（プロトコルに関わらず）
    if (fileHandle) {
      try {
        const file = await fileHandle.getFile();
        const content = await file.text();
        
        if (content.length === 0) {
          log(`${fileName}が空です: デフォルトデータを使用`);
          return null;
        }
        
        const data = JSON.parse(content);
        log(`${fileName}を読み込み（ファイルハンドル使用）: 成功`);
        return data;
      } catch (handleError) {
        log(`ファイルハンドルエラー: ${handleError.message}`);
        // ファイルハンドルが無効な場合はクリア
        fileHandles[fileHandleKey] = null;
        fileHandle = null;
      }
    }
    
    // ファイルハンドルがない場合の処理
    if (!fileHandle) {
      // skipPickerがtrueの場合はファイル選択をスキップ
      if (skipPicker) {
        log(`${fileName}のファイル選択をスキップ: デフォルトデータを使用`);
        return null;
      }
      
      // File System Access APIを使用してファイルを選択
      if (!window.showOpenFilePicker) {
        log(`File System Access APIがサポートされていません`);
        return null;
      }
      
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'JSON files',
            accept: { 'application/json': ['.json'] }
          }],
          suggestedName: fileName
        });
        
        fileHandle = handle;
        fileHandles[fileHandleKey] = handle;
        log(`${fileName}のファイルハンドルを保存: ${handle.name}`);
        
        // ファイルを読み込み
        const file = await fileHandle.getFile();
        const content = await file.text();
        
        if (content.length === 0) {
          log(`${fileName}が空です: デフォルトデータを使用`);
          return null;
        }
        
        const data = JSON.parse(content);
        log(`${fileName}を読み込み: 成功`);
        return data;
      } catch (pickerError) {
        if (pickerError.name === 'AbortError') {
          log(`${fileName}のファイル選択がキャンセルされました`);
        } else {
          log(`ファイル選択エラー: ${pickerError.message}`);
        }
        return null;
      }
    }
    
  } catch (error) {
    log(`${fileName}読み込みエラー: ${error.message}`);
    return null;
  }
}

// JSONファイルに書き込む汎用関数
async function writeJsonFile(fileName, fileHandleKey, data) {
  const log = (msg) => console.log(`[writeJsonFile] ${msg}`);
  
  try {
    const protocol = window.location.protocol;
    
    // 保存するデータにタイムスタンプを追加
    data.lastUpdated = new Date().toISOString();
    
    let fileHandle = fileHandles[fileHandleKey];
    
    if (!fileHandle) {
      // ファイルハンドルがない場合は手動選択
      if (!window.showSaveFilePicker) {
        log(`File System Access APIがサポートされていません`);
        return false;
      }
      
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }]
        });
        
        fileHandles[fileHandleKey] = fileHandle;
        log(`${fileName}のファイルハンドルを保存: ${fileHandle.name}`);
      } catch (pickerError) {
        if (pickerError.name === 'AbortError') {
          log(`${fileName}のファイル選択がキャンセルされました`);
        }
        return false;
      }
    }
    
    // 既存ファイルの内容を確認してマージ（全プロトコル対応）
    if (fileHandle) {
      try {
        const existingFile = await fileHandle.getFile();
        const existingContent = await existingFile.text();
        
        if (existingContent && existingContent.trim().length > 0) {
          log(`${fileName}に既存データあり: マージを試行`);
          
          try {
            const existingData = JSON.parse(existingContent);
            
            // データ構造に応じてマージ
            const mergedData = mergeJsonData(fileName, existingData, data);
            data = mergedData;
            
            log(`${fileName}のデータをマージしました`);
          } catch (parseError) {
            log(`既存データのJSON解析エラー: ${parseError.message} - 新しいデータで上書きします`);
            // 解析エラーの場合は新しいデータで上書き
          }
        } else {
          log(`${fileName}は空ファイル: 新しいデータで初期化`);
        }
      } catch (readError) {
        log(`既存ファイル読み込みエラー: ${readError.message} - 新しいデータで上書きします`);
        // 読み込みエラーの場合は新しいデータで上書き
      }
    }
    
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    
    log(`${fileName}に保存: 成功 (${fileHandle.name})`);
    return true;
    
  } catch (error) {
    log(`${fileName}書き込みエラー: ${error.message}`);
    // エラー時はファイルハンドルをクリア
    fileHandles[fileHandleKey] = null;
    return false;
  }
}

// JSONデータをマージする関数
function mergeJsonData(fileName, existingData, newData) {
  const log = (msg) => console.log(`[mergeJsonData] ${msg}`);
  
  // ファイル名に応じて適切なマージ処理を実行
  switch (fileName) {
    case 'settings.json':
      // settings.jsonは新しいデータで上書き（全体設定なので）
      log(`settings.json: 新しい設定で更新`);
      return newData;
      
    case 'progress.json':
      // progress.jsonは単語帳のハッシュごとにマージ
      log(`progress.json: 進捗データをマージ`);
      return {
        ...existingData,
        ...newData,
        allProgress: {
          ...(existingData.allProgress || {}),
          ...(newData.allProgress || {})
        },
        wordbookHistory: mergeWordbookHistory(
          existingData.wordbookHistory || [],
          newData.wordbookHistory || []
        ),
        lastUpdated: newData.lastUpdated
      };
      
    case 'sessions.json':
      // sessions.jsonはセッション配列をマージ
      log(`sessions.json: セッション記録をマージ`);
      return {
        ...existingData,
        ...newData,
        sessions: [
          ...(existingData.sessions || []),
          ...(newData.sessions || [])
        ].filter((session, index, self) => 
          // 重複を除去（IDで判定）
          index === self.findIndex(s => s.id === session.id)
        ),
        lastUpdated: newData.lastUpdated
      };
      
    case 'data.json':
      // data.jsonはセッション配列をマージ（タイムスタンプでソート）
      log(`data.json: 統計データをマージ`);
      const mergedSessions = [
        ...(existingData.sessions || []),
        ...(newData.sessions || [])
      ];
      
      // タイムスタンプで重複を除去
      const uniqueSessions = mergedSessions.filter((session, index, self) => 
        index === self.findIndex(s => 
          Array.isArray(s) && Array.isArray(session) && s[0] === session[0]
        )
      );
      
      // タイムスタンプでソート（新しい順）
      uniqueSessions.sort((a, b) => {
        if (!Array.isArray(a) || !Array.isArray(b)) return 0;
        const timeA = a[0].split('.').map(Number);
        const timeB = b[0].split('.').map(Number);
        return new Date(timeB[0], timeB[1]-1, timeB[2], timeB[3], timeB[4], timeB[5]) - 
               new Date(timeA[0], timeA[1]-1, timeA[2], timeA[3], timeA[4], timeA[5]);
      });
      
      return {
        ...existingData,
        ...newData,
        sessions: uniqueSessions,
        totalSessions: uniqueSessions.length,
        lastUpdated: newData.lastUpdated
      };
      
    case 'debug.json':
      // debug.jsonはログ配列をマージ
      log(`debug.json: デバッグログをマージ`);
      const mergedLogs = [
        ...(existingData.logs || []),
        ...(newData.logs || [])
      ];
      
      // タイムスタンプとメッセージで重複を除去
      const uniqueLogs = mergedLogs.filter((log, index, self) => 
        index === self.findIndex(l => 
          l.timestamp === log.timestamp && l.message === log.message
        )
      );
      
      // タイムスタンプでソート
      uniqueLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // 最新1000件のみ保持
      const finalLogs = uniqueLogs.length > 1000 ? uniqueLogs.slice(-1000) : uniqueLogs;
      
      return {
        logs: finalLogs,
        lastUpdated: newData.lastUpdated
      };
      
    case 'achieve.json':
      // achieve.jsonは実績データをマージ
      log(`achieve.json: 実績データをマージ`);
      return {
        ...existingData,
        ...newData,
        lastUpdated: newData.lastUpdated
      };
      
    default:
      // その他のファイルは新しいデータで上書き
      log(`${fileName}: デフォルト処理（上書き）`);
      return newData;
  }
}

// 単語帳履歴をマージする関数
function mergeWordbookHistory(existingHistory, newHistory) {
  const log = (msg) => console.log(`[mergeWordbookHistory] ${msg}`);
  
  // ハッシュをキーとしてマージ
  const historyMap = new Map();
  
  // 既存の履歴を追加
  existingHistory.forEach(entry => {
    if (entry.hash) {
      historyMap.set(entry.hash, entry);
    }
  });
  
  // 新しい履歴で更新（同じハッシュは上書き）
  newHistory.forEach(entry => {
    if (entry.hash) {
      historyMap.set(entry.hash, entry);
    }
  });
  
  // Map を配列に変換
  const mergedHistory = Array.from(historyMap.values());
  
  log(`単語帳履歴をマージ: ${existingHistory.length}件 + ${newHistory.length}件 → ${mergedHistory.length}件`);
  
  // 最新10件のみ保持
  return mergedHistory.slice(0, 10);
}

// 全てのJSONファイルのファイルハンドルを一括取得する関数
async function setupAllFileHandles() {
  const log = (msg) => console.log(`[setupAllFileHandles] ${msg}`);
  log(`=== ファイルハンドル一括取得開始 ===`);
  
  try {
    if (!window.showOpenFilePicker) {
      log(`File System Access APIがサポートされていません`);
      return false;
    }
    
    // プロトコルに応じたメッセージ
    let confirmMessage = 'JSONファイルの自動保存を有効にしますか？\n\n';
    
    if (window.location.protocol === 'file:') {
      confirmMessage += 
        '【重要】同じフォルダ内のJSONファイルを選択してください\n\n' +
        '選択するファイル（同じフォルダ内）：\n' +
        '1. progress.json（進捗データ）\n' +
        '2. settings.json（設定）\n' +
        '3. sessions.json（セッション記録）\n' +
        '4. data.json（統計データ）\n' +
        '5. debug.json（デバッグログ）\n\n' +
        '※ 空のファイルは自動的に初期化されます\n' +
        '※ ファイルが存在しない場合は新規作成してから選択してください\n' +
        '※ 一度設定すると、以降は自動的に保存されます（ダウンロード不要）';
    } else {
      confirmMessage +=
        '「OK」を選択すると、以下のファイルを選択するダイアログが表示されます：\n' +
        '1. progress.json（進捗データ）\n' +
        '2. settings.json（設定）\n' +
        '3. sessions.json（セッション記録）\n' +
        '4. data.json（統計データ）\n' +
        '5. debug.json（デバッグログ）\n\n' +
        '※ ファイルが存在しない場合は新規作成されます\n' +
        '※ 一度設定すると、以降は自動的にファイルに保存されます';
    }
    
    const shouldSetup = confirm(confirmMessage);
    
    if (!shouldSetup) {
      log(`ユーザーがファイルハンドル取得をキャンセルしました`);
      return false;
    }
    
    const files = [
      { name: 'progress.json', key: 'progress', default: { version: "1.0", allProgress: {}, wordbookHistory: [] } },
      { name: 'settings.json', key: 'settings', default: { 
          version: "1.0", 
          debugMode: false, 
          speechVolume: 1.0,
          speechRate: 1.0,
          defaultNewWordCount: 10,
          defaultReviewWordCount: 10,
          defaultQuestionFontSize: 32,
          debugInfoMaxCount: 5,
          newWordCount: 10, 
          reviewWordCount: 10, 
          questionFontSize: 32, 
          loginStreak: 0, 
          lastLoginDate: "", 
          totalXP: 0, 
          currentLevel: 1 
        } 
      },
      { name: 'sessions.json', key: 'sessions', default: { version: "1.0", sessions: [] } },
      { name: 'data.json', key: 'data', default: { version: "2.0", format: "array", sessions: [] } },
      { name: 'debug.json', key: 'debug', default: { logs: [] } }
    ];
    
    for (const fileInfo of files) {
      try {
        log(`${fileInfo.name}を選択してください...`);
        
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'JSON files',
            accept: { 'application/json': ['.json'] }
          }],
          suggestedName: fileInfo.name
        });
        
        fileHandles[fileInfo.key] = handle;
        log(`${fileInfo.name}のファイルハンドルを取得: ${handle.name}`);
        
        // ファイルの内容を確認
        const file = await handle.getFile();
        const content = await file.text();
        
        if (content.length === 0) {
          log(`${fileInfo.name}が空です: デフォルトデータで初期化します`);
          
          // 空のファイルにデフォルトデータを書き込み
          const writable = await handle.createWritable();
          await writable.write(JSON.stringify(fileInfo.default, null, 2));
          await writable.close();
          
          log(`${fileInfo.name}を初期化しました`);
        } else {
          log(`${fileInfo.name}に既存データがあります (${content.length}文字)`);
        }
        
      } catch (error) {
        if (error.name === 'AbortError') {
          log(`${fileInfo.name}の選択がキャンセルされました`);
          alert(`${fileInfo.name}の選択がキャンセルされました。\n自動保存機能は無効です。`);
          return false;
        } else {
          log(`${fileInfo.name}の取得エラー: ${error.message}`);
        }
      }
    }
    
    log(`=== ファイルハンドル一括取得完了 ===`);
    
    // 設定完了フラグを保存
    localStorage.setItem('fileHandlesConfigured', 'true');
    log('ファイルハンドル設定完了フラグを保存しました');
    
    alert('ファイルの設定が完了しました。\n以降、データは自動的にファイルに保存されます。');
    return true;
    
  } catch (error) {
    log(`ファイルハンドル一括取得エラー: ${error.message}`);
    return false;
  }
}

// 全てのJSONファイルを初期化する関数
async function initializeDataFiles() {
  const log = (msg) => console.log(`[initializeDataFiles] ${msg}`);
  log(`=== データファイル初期化開始 ===`);
  
  // progress.jsonの初期化
  const progressFileData = await readJsonFile('progress.json', 'progress');
  if (!progressFileData) {
    log(`progress.jsonが見つかりません: 新規作成します`);
    await writeJsonFile('progress.json', 'progress', {
      version: "1.0",
      allProgress: {},
      wordbookHistory: []
    });
  }
  
  // settings.jsonの初期化
  const settingsData = await readJsonFile('settings.json', 'settings');
  if (!settingsData) {
    log(`settings.jsonが見つかりません: 新規作成します`);
    await writeJsonFile('settings.json', 'settings', {
      version: "1.0",
      debugMode: false,
      speechVolume: 1.0,
      speechRate: 1.0,
      defaultNewWordCount: 10,
      defaultReviewWordCount: 10,
      defaultQuestionFontSize: 32,
      newWordCount: 10,
      reviewWordCount: 10,
      questionFontSize: 32,
      loginStreak: 0,
      lastLoginDate: "",
      totalXP: 0,
      currentLevel: 1
    });
  }
  
  // sessions.jsonの初期化
  const sessionsFileData = await readJsonFile('sessions.json', 'sessions');
  if (!sessionsFileData) {
    log(`sessions.jsonが見つかりません: 新規作成します`);
    await writeJsonFile('sessions.json', 'sessions', {
      version: "1.0",
      sessions: []
    });
  }
  
  log(`=== データファイル初期化完了 ===`);
}

// ========================================
// データアクセス関数（localStorageの代替）
// ========================================

// 設定を読み込む
async function loadSettings(skipPicker = true) {
  const settings = await readJsonFile('settings.json', 'settings', skipPicker);
  if (settings) {
    debugMode = settings.debugMode !== undefined ? settings.debugMode : false;
    newWordCount = settings.newWordCount || 10;
    reviewWordCount = settings.reviewWordCount || 10;
    questionFontSize = settings.questionFontSize || 32;
    totalXP = settings.totalXP || 0;
    currentLevel = settings.currentLevel || 1;
    
    // 音声設定
    speechVolume = settings.speechVolume !== undefined ? settings.speechVolume : 1.0;
    speechRate = settings.speechRate !== undefined ? settings.speechRate : 1.0;
    
    // 新規単語帳の初期設定
    defaultNewWordCount = settings.defaultNewWordCount || 10;
    defaultReviewWordCount = settings.defaultReviewWordCount || 10;
    defaultQuestionFontSize = settings.defaultQuestionFontSize || 32;
    
    // デバッグ情報表示数
    debugInfoMaxCount = settings.debugInfoMaxCount !== undefined ? settings.debugInfoMaxCount : 5;
    
    return settings;
  }
  return null;
}

// 設定を保存する
async function saveSettings(settings) {
  return await writeJsonFile('settings.json', 'settings', settings);
}

// 全体設定を読み込んでUIに反映する関数
async function loadGlobalSettings() {
  showDebugInfo('=== 全体設定を読み込み中 ===');
  
  const settings = await loadSettings(true);
  
  // 音量設定
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  if (volumeSlider && volumeValue) {
    const volume = Math.round((settings?.speechVolume ?? speechVolume) * 100);
    volumeSlider.value = volume;
    volumeValue.textContent = volume;
    speechVolume = volume / 100;
  }
  
  // 速度設定
  const rateSlider = document.getElementById('rateSlider');
  const rateValue = document.getElementById('rateValue');
  if (rateSlider && rateValue) {
    const rate = (settings?.speechRate ?? speechRate) * 10; // 0.1-2.0 → 1-20
    rateSlider.value = Math.round(rate);
    rateValue.textContent = ((settings?.speechRate ?? speechRate)).toFixed(1);
    speechRate = settings?.speechRate ?? speechRate;
  }
  
  // 新規単語帳の初期設定
  const defaultNewCount = document.getElementById('defaultNewCount');
  const defaultReviewCount = document.getElementById('defaultReviewCount');
  const defaultFontSize = document.getElementById('defaultFontSize');
  
  if (defaultNewCount) {
    defaultNewCount.value = settings?.defaultNewWordCount ?? defaultNewWordCount;
    defaultNewWordCount = settings?.defaultNewWordCount ?? defaultNewWordCount;
  }
  
  if (defaultReviewCount) {
    defaultReviewCount.value = settings?.defaultReviewWordCount ?? defaultReviewWordCount;
    defaultReviewWordCount = settings?.defaultReviewWordCount ?? defaultReviewWordCount;
  }
  
  if (defaultFontSize) {
    defaultFontSize.value = settings?.defaultQuestionFontSize ?? defaultQuestionFontSize;
    defaultQuestionFontSize = settings?.defaultQuestionFontSize ?? defaultQuestionFontSize;
  }
  
  // デバッグモード
  const debugModeToggle = document.getElementById('debugModeToggle');
  if (debugModeToggle) {
    debugModeToggle.checked = debugMode;
  }
  
  // デバッグ情報表示数
  const debugInfoCountValue = settings?.debugInfoMaxCount ?? debugInfoMaxCount;
  debugInfoMaxCount = debugInfoCountValue;
  
  const debugInfoCountSlider = document.getElementById('debugInfoCountSlider');
  const debugInfoCountInput = document.getElementById('debugInfoCountInput');
  const debugInfoCountValueDisplay = document.getElementById('debugInfoCountValue');
  
  if (debugInfoCountSlider) {
    // 対数スケールに変換（1-1000を0-1000の線形スケールに）
    debugInfoCountSlider.value = debugInfoCountValue;
  }
  
  if (debugInfoCountInput) {
    debugInfoCountInput.value = debugInfoCountValue;
  }
  
  if (debugInfoCountValueDisplay) {
    debugInfoCountValueDisplay.textContent = debugInfoCountValue;
  }
  
  showDebugInfo('全体設定の読み込み完了');
}

// 全体設定を保存する関数
async function saveGlobalSettings() {
  showDebugInfo('=== 全体設定を保存中 ===');
  
  // UI要素から値を取得
  const volumeSlider = document.getElementById('volumeSlider');
  const rateSlider = document.getElementById('rateSlider');
  const defaultNewCount = document.getElementById('defaultNewCount');
  const defaultReviewCount = document.getElementById('defaultReviewCount');
  const defaultFontSize = document.getElementById('defaultFontSize');
  const debugInfoCountInput = document.getElementById('debugInfoCountInput');
  
  // 設定オブジェクトを作成
  const settings = {
    version: "1.0",
    debugMode: debugMode,
    speechVolume: volumeSlider ? parseInt(volumeSlider.value) / 100 : speechVolume,
    speechRate: rateSlider ? parseInt(rateSlider.value) / 10 : speechRate,
    defaultNewWordCount: defaultNewCount ? parseInt(defaultNewCount.value) : defaultNewWordCount,
    defaultReviewWordCount: defaultReviewCount ? parseInt(defaultReviewCount.value) : defaultReviewWordCount,
    defaultQuestionFontSize: defaultFontSize ? parseInt(defaultFontSize.value) : defaultQuestionFontSize,
    debugInfoMaxCount: debugInfoCountInput ? Math.floor(parseFloat(debugInfoCountInput.value)) : debugInfoMaxCount,
    newWordCount: newWordCount,
    reviewWordCount: reviewWordCount,
    questionFontSize: questionFontSize,
    loginStreak: parseInt(localStorage.getItem('loginStreak') || '0', 10),
    lastLoginDate: localStorage.getItem('lastLoginDate') || '',
    totalXP: totalXP,
    currentLevel: currentLevel
  };
  
  // グローバル変数を更新
  speechVolume = settings.speechVolume;
  speechRate = settings.speechRate;
  defaultNewWordCount = settings.defaultNewWordCount;
  defaultReviewWordCount = settings.defaultReviewWordCount;
  defaultQuestionFontSize = settings.defaultQuestionFontSize;
  debugInfoMaxCount = settings.debugInfoMaxCount;
  
  // settings.jsonに保存
  await saveSettings(settings);
  
  showDebugInfo('全体設定を保存しました');
  showDebugInfo(`音量: ${(settings.speechVolume * 100).toFixed(0)}%, 速度: ${settings.speechRate.toFixed(1)}x`);
  showDebugInfo(`初期設定: 新出${settings.defaultNewWordCount}, 復習${settings.defaultReviewWordCount}, フォント${settings.defaultQuestionFontSize}px`);
  showDebugInfo(`デバッグ情報表示数: ${settings.debugInfoMaxCount}件`);
}

// 進捗データを読み込む
async function loadProgressData(skipPicker = true) {
  const data = await readJsonFile('progress.json', 'progress', skipPicker);
  return data || { version: "1.0", allProgress: {}, wordbookHistory: [] };
}

// 進捗データを保存する
async function saveProgressData(data) {
  return await writeJsonFile('progress.json', 'progress', data);
}

// セッションデータを読み込む
async function loadSessionsData(skipPicker = true) {
  const data = await readJsonFile('sessions.json', 'sessions', skipPicker);
  return data || { version: "1.0", sessions: [] };
}

// セッションデータを保存する
async function saveSessionsData(data) {
  return await writeJsonFile('sessions.json', 'sessions', data);
}

if (debug) {
  debugMode = true;
  console.log(`デバッグモード: ${debugMode ? 'ON' : 'OFF'}`);
} else {
  debugMode = false;
}

// プロトコルの確認とメッセージ表示
showDebugInfo(`実行プロトコル: ${window.location.protocol}`);
showDebugInfo(`JSONファイル読み込みを初期化します`);

// XPシステム
let totalXP = 0;
let currentLevel = 1;
let nextLevelXP = 1; // 1.2^(1-1) = 1

// デバッグモードのパスワード（変更してください）
const debugpswd = "debug2024";

// 管理者パスワード（高度なデバッグ機能用）
const adminpswd = "admindebug";

// 音量設定
let speechVolume = 1.0; // 0.0 ~ 1.0
let speechRate = 1.0; // 0.1 ~ 10

// 新規単語帳の初期設定
let defaultNewWordCount = 10;
let defaultReviewWordCount = 10;
let defaultQuestionFontSize = 32;

// 高度な設定の表示状態
let advancedSettingsEnabled = false;

// デバッグモードを簡単に切り替えるためのグローバル関数
// 使用方法:
// - toggleDebugMode(): デバッグモードをON/OFF切り替え
// - setDebugMode(true/false): デバッグモードを指定した値に設定
// - getDebugMode(): 現在のデバッグモード状態を取得
// 例: コンソールで toggleDebugMode() を実行
window.toggleDebugMode = async function() {
  debugMode = !debugMode;
  
  // settings.jsonに保存
  const settings = await loadSettings() || {};
  settings.debugMode = debugMode;
  await saveSettings(settings);
  
  updateDebugInfoVisibility();
  console.log(`デバッグモード: ${debugMode ? 'ON' : 'OFF'}`);
  
  // data.json読み込みボタンの表示を更新
  const loadDataJsonBtn = document.getElementById('loadDataJsonBtn');
  if (loadDataJsonBtn) {
    loadDataJsonBtn.style.display = debugMode ? 'inline-block' : 'none';
  }
  
  // デバッグモードがONになった場合のヘルプ表示
  if (debugMode) {
    console.log('=== デバッグモードが有効になりました ===');
    console.log('使用可能なコマンド:');
    console.log('- \\ または ¥ キー: 詳細な統計状況確認画面を表示');
    console.log('- debugStatsPopup(): 統計ポップアップ要素の確認');
    console.log('- forceShowStatsPopup(): 統計ポップアップの強制表示');
    console.log('- forceShowGlobalStatsPopup(): 全体統計ポップアップの強制表示');
    console.log('- debugDataJsonLoading(): data.json読み込み問題の診断');
    console.log('- debugLoadDataJson(): デバッグモードでの手動data.json読み込み');
    console.log('- setDebugMode(false): デバッグモードをOFFに設定');
  }
  
  return debugMode;
};

window.setDebugMode = async function(enabled) {
  debugMode = !!enabled;
  
  // settings.jsonに保存
  const settings = await loadSettings() || {};
  settings.debugMode = debugMode;
  await saveSettings(settings);
  
  updateDebugInfoVisibility();
  console.log(`デバッグモード: ${debugMode ? 'ON' : 'OFF'}`);
  
  // data.json読み込みボタンの表示を更新
  const loadDataJsonBtn = document.getElementById('loadDataJsonBtn');
  if (loadDataJsonBtn) {
    loadDataJsonBtn.style.display = debugMode ? 'inline-block' : 'none';
  }
  
  // デバッグモードがONになった場合のヘルプ表示
  if (debugMode) {
    console.log('=== デバッグモードが有効になりました ===');
    console.log('使用可能なコマンド:');
    console.log('- \\ または ¥ キー: 詳細な統計状況確認画面を表示');
    console.log('- debugStatsPopup(): 統計ポップアップ要素の確認');
    console.log('- forceShowStatsPopup(): 統計ポップアップの強制表示');
    console.log('- forceShowGlobalStatsPopup(): 全体統計ポップアップの強制表示');
    console.log('- debugDataJsonLoading(): data.json読み込み問題の診断');
    console.log('- debugLoadDataJson(): デバッグモードでの手動data.json読み込み');
    console.log('- setDebugMode(false): デバッグモードをOFFに設定');
  }
  
  return debugMode;
};

window.getDebugMode = function() {
  return debugMode;
};

// デバッグモードのヘルプを表示する関数
window.showDebugHelp = function() {
  console.log('=== デバッグモード ヘルプ ===');
  console.log('現在のデバッグモード:', debugMode ? 'ON' : 'OFF');
  console.log('');
  console.log('使用可能なコマンド:');
  console.log('- toggleDebugMode(): デバッグモードをON/OFF切り替え');
  console.log('- setDebugMode(true/false): デバッグモードを指定した値に設定');
  console.log('- getDebugMode(): 現在のデバッグモード状態を取得');
  console.log('- showDebugHelp(): このヘルプを表示');
  console.log('- setupAllFileHandles(): JSONファイルの自動保存を設定');
  console.log('- checkDebugLogStatus(): デバッグログの保存状況を確認');
  console.log('- showPassword(): 高度な設定のパスワードを表示');
  console.log('');
  console.log('デバッグモードがONの場合:');
  console.log('- \\ または ¥ キー: 詳細な統計状況確認画面を表示');
  console.log('- debugStatsPopup(): 統計ポップアップ要素の確認');
  console.log('- forceShowStatsPopup(): 統計ポップアップの強制表示');
  console.log('- forceShowGlobalStatsPopup(): 全体統計ポップアップの強制表示');
  console.log('');
  console.log('例: コンソールで setDebugMode(true) を実行してデバッグモードを有効化');
  console.log('');
  console.log('💡 デバッグログが保存されない場合:');
  console.log('1. checkDebugLogStatus() でログの状況を確認');
  console.log('2. setupAllFileHandles() でファイルハンドルを設定');
};

// グローバル関数として公開
window.setupAllFileHandles = setupAllFileHandles;

// 管理者パスワードを確認する関数（開発用）
window.showAdminPassword = function() {
  console.log('=== 管理者パスワード ===');
  console.log(`パスワード: "${adminpswd}"`);
  console.log(`文字数: ${adminpswd.length}`);
  console.log('');
  console.log('💡 このパスワードを入力してください:');
  console.log(`  ${adminpswd}`);
  console.log('');
  console.log('使用方法:');
  console.log('1. 「⚙️ 設定」→ 隠しボタンでパスワード入力 → 高度な設定を表示');
  console.log('2. 「🔓 管理者デバッグを開く」をクリック');
  console.log('3. 管理者パスワードを入力');
  console.log('');
  console.log('⚠️ 警告: 管理者機能ではデータを直接編集できます');
  return adminpswd;
};

// パスワードを確認する関数（開発用）
window.showPassword = function() {
  console.log('=== デバッグモードのパスワード ===');
  console.log(`パスワード: "${debugpswd}"`);
  console.log(`文字数: ${debugpswd.length}`);
  console.log('');
  console.log('=== 管理者パスワード ===');
  console.log(`パスワード: "${adminpswd}"`);
  console.log(`文字数: ${adminpswd.length}`);
  console.log('');
  console.log('💡 このパスワードを入力してください:');
  console.log(`  デバッグモード: ${debugpswd}`);
  console.log(`  管理者機能: ${adminpswd}`);
  console.log('');
  console.log('使用方法:');
  console.log('1. 「⚙️ 設定」→ タイトル下の隠しボタンをクリック');
  console.log('2. パスワード入力ダイアログに上記のパスワードを入力');
  return { debug: debugpswd, admin: adminpswd };
};

// 管理者デバッグの値を読み込む関数
async function loadAdminDebugValues() {
  showDebugInfo('=== 管理者デバッグ値を読み込み中 ===');
  
  // XP・レベル
  const adminTotalXP = document.getElementById('adminTotalXP');
  const adminCurrentLevel = document.getElementById('adminCurrentLevel');
  
  if (adminTotalXP) adminTotalXP.value = totalXP;
  if (adminCurrentLevel) adminCurrentLevel.value = currentLevel;
  
  // 連続記録
  const adminLoginStreak = document.getElementById('adminLoginStreak');
  const adminLastLoginDate = document.getElementById('adminLastLoginDate');
  
  if (adminLoginStreak) {
    adminLoginStreak.value = parseInt(localStorage.getItem('loginStreak') || '0', 10);
  }
  
  if (adminLastLoginDate) {
    const lastDate = localStorage.getItem('lastLoginDate') || '';
    adminLastLoginDate.value = lastDate;
  }
  
  // 単語リストを更新
  updateAdminWordList();
  
  showDebugInfo('管理者デバッグ値の読み込み完了');
}

// 単語リストを更新する関数
function updateAdminWordList() {
  const adminWordSelect = document.getElementById('adminWordSelect');
  
  if (!adminWordSelect) return;
  
  // 単語帳が読み込まれていない場合
  if (!allWords || allWords.length === 0) {
    adminWordSelect.innerHTML = '<option value="">単語帳を読み込んでください</option>';
    showDebugInfo('単語リスト更新: 単語帳未読み込み');
    return;
  }
  
  // 単語リストを生成
  adminWordSelect.innerHTML = '<option value="">単語を選択してください</option>';
  
  allWords.forEach((word, index) => {
    const option = document.createElement('option');
    option.value = word.question;
    option.textContent = `${word.question} → ${word.answer}`;
    adminWordSelect.appendChild(option);
  });
  
  showDebugInfo(`単語リスト更新: ${allWords.length}個の単語`);
}

// 管理者編集をdebug.jsonに記録する関数
async function saveAdminEditToDebugJson(editType, oldValue, newValue, details = {}) {
  const now = new Date();
  const jstOffset = 9 * 60;
  const jstTime = new Date(now.getTime() + (jstOffset * 60 * 1000));
  const timestamp = jstTime.toISOString().replace('Z', '+09:00');
  
  const editRecord = {
    timestamp: timestamp,
    type: 'ADMIN_EDIT',
    editType: editType,
    oldValue: oldValue,
    newValue: newValue,
    details: details,
    userAgent: navigator.userAgent
  };
  
  // debug.jsonに記録
  try {
    let debugData = { logs: [] };
    const existingData = localStorage.getItem('debugData');
    
    if (existingData && existingData.trim().length > 0) {
      try {
        debugData = JSON.parse(existingData);
        if (!debugData.logs || !Array.isArray(debugData.logs)) {
          debugData.logs = [];
        }
      } catch (e) {
        debugData = { logs: [] };
      }
    }
    
    // 管理者編集記録を追加
    debugData.logs.push(editRecord);
    
    // localStorageに保存
    localStorage.setItem('debugData', JSON.stringify(debugData));
    
    // ファイルにも保存
    if (fileHandles.debug) {
      try {
        const writable = await fileHandles.debug.createWritable();
        await writable.write(JSON.stringify(debugData, null, 2));
        await writable.close();
        
        console.log(`[管理者編集] debug.jsonに記録しました: ${editType}`);
      } catch (error) {
        console.error('debug.json保存エラー:', error);
      }
    }
    
    showDebugInfo(`管理者編集を記録: ${editType}`);
    
  } catch (error) {
    console.error('管理者編集記録エラー:', error);
  }
}

// デバッグログの状況を確認する関数
window.checkDebugLogStatus = function() {
  try {
    const debugData = localStorage.getItem('debugData');
    if (!debugData || debugData.trim().length === 0) {
      console.log('=== デバッグログ状況 ===');
      console.log('ログ数: 0件（データなし）');
      console.log('ファイルハンドル: 未設定');
      console.log('');
      console.log('💡 ヒント:');
      console.log('1. アプリを操作してデバッグログを生成してください');
      console.log('2. 「⚙️ 設定」→「📁 ファイルハンドルを設定」で自動保存を有効化');
      return;
    }
    
    const parsed = JSON.parse(debugData);
    const logCount = parsed.logs ? parsed.logs.length : 0;
    
    console.log('=== デバッグログ状況 ===');
    console.log(`ログ数: ${logCount}件`);
    console.log(`ファイルハンドル: ${fileHandles.debug ? '✅ 設定済み' : '❌ 未設定'}`);
    console.log(`最終保存: ${lastDebugLogCount}件のログを保存済み`);
    console.log(`未保存: ${logCount - lastDebugLogCount}件`);
    console.log('');
    
    if (!fileHandles.debug) {
      console.log('⚠️ ファイルハンドルが未設定です');
      console.log('💡 設定方法:');
      console.log('1. 「⚙️ 設定」ボタンをクリック');
      console.log('2. 「📁 ファイルハンドルを設定」をクリック');
      console.log('3. 5つのJSONファイルを順番に選択');
      console.log('');
      console.log('または:');
      console.log('- コンソールで setupAllFileHandles() を実行');
    } else {
      console.log('✅ ファイルハンドル設定済み');
      console.log('次回の自動保存: 100件到達時 または 5分経過時');
    }
    
    if (logCount > 0 && parsed.logs.length > 0) {
      console.log('');
      console.log('最新のログ（5件）:');
      parsed.logs.slice(-5).forEach((log, index) => {
        console.log(`${index + 1}. [${log.timestamp}] ${log.message}`);
      });
    }
    
  } catch (error) {
    console.error('デバッグログ状況確認エラー:', error);
  }
};

// ページ読み込み時の初期化
window.addEventListener('DOMContentLoaded', async function() {
  document.getElementById("fileInput").addEventListener("change", handleFile);
  
  // 設定を読み込み（ファイル選択なし）
  await loadSettings(true);
  
  // 進捗データを読み込み（ファイル選択なし）
  await loadProgress();
  
  loadFontSizeSetting(); // 追加: フォントサイズ設定を反映
  updateInitialDisplay();
  
  updateDebugInfoVisibility();
  // 新しい単語帳を読み込みボタン
  const loadNewBtn = document.getElementById('loadNewBtn');
  if (loadNewBtn) {
    loadNewBtn.onclick = function() {
      document.getElementById('fileInput').click();
    };
  }
  // 初回ロード時にメニュー画面表示
  await showMenuScreen();
  
  // file://プロトコルで、ファイルハンドルが設定されていない場合は自動的に設定を促す
  if (window.location.protocol === 'file:') {
    // localStorageにファイルハンドル設定済みフラグがあるかチェック
    const fileHandlesConfigured = localStorage.getItem('fileHandlesConfigured');
    
    if (!fileHandlesConfigured) {
      // 初回起動時のみ、ファイルハンドル設定を促す
      setTimeout(async () => {
        const shouldSetup = confirm(
          'file://プロトコルで起動しています。\n\n' +
          'データを永続的に保存するには、JSONファイルの設定が必要です。\n' +
          '5つのファイルを順番に選択してください。\n\n' +
          '今すぐ設定しますか？（この設定は1回だけです）\n\n' +
          '※「OK」: 今すぐ設定（推奨）\n' +
          '※「キャンセル」: 後で設定（ヘッダーの「⚙️ 設定」から）'
        );
        
        if (shouldSetup) {
          const success = await setupAllFileHandles();
          if (success) {
            // 設定完了フラグを保存
            localStorage.setItem('fileHandlesConfigured', 'true');
            showDebugInfo('ファイルハンドル設定完了フラグを保存しました');
            
            // 設定完了後にメニュー画面を更新
            await showMenuScreen();
          }
        } else {
          showDebugInfo('ファイルハンドル設定をスキップしました。後から設定できます。');
          // スキップした場合もフラグを保存（次回から聞かない）
          localStorage.setItem('fileHandlesConfigured', 'skipped');
        }
      }, 1000);
    } else {
      showDebugInfo(`ファイルハンドル設定済み（フラグ: ${fileHandlesConfigured}）`);
      
      // スキップされていた場合で、まだファイルハンドルが設定されていない場合
      if (fileHandlesConfigured === 'skipped') {
        const hasAnyFileHandle = Object.values(fileHandles).some(handle => handle !== null);
        if (!hasAnyFileHandle) {
          showDebugInfo('ファイルハンドルが未設定です。「⚙️ 設定」→「📁 ファイルハンドルを設定」で設定できます。');
        }
      }
    }
  }
  
  // メニューに戻るボタン
  const backBtn = document.getElementById('backToMenuBtn');
  if (backBtn) {
    backBtn.onclick = function() {
      // 学習中かどうかをチェック
      if (isLearningInProgress()) {
        showQuitConfirmPopup();
      } else {
        showMenuScreen(); // ボタンのクリックハンドラなのでawaitなし
      }
    };
  }
  setupPopup(); // ポップアップのイベントリスナー設定
  // 連続記録とXPを読み込み
  loadXP();
  
  // data.jsonの自動読み込み（連続記録チェックとXP計算の前に実行）
  autoLoadDataJson().then(() => {
    // data.json読み込み完了後の処理
    showDebugInfo(`data.json読み込み完了後の処理を開始`);
    
    // 連続記録のチェックと更新（data.jsonを読み込んだ後に実行）
    checkAndUpdateLoginStreak();
    
    // XPを計算・更新（data.jsonを読み込んだ後に実行）
    calculateAndUpdateXP();
    
    // 連続記録の表示を更新
    updateStreakDisplay();
    
    showDebugInfo(`初期化完了: 連続記録とXPを更新しました`);
  });
  
  // 既存のdebug.jsonファイルを読み込み
  loadExistingDebugJson();
  
  // セッション記録を読み込み
  loadSessionData();
  
  // タブを閉じる時にdebug.jsonを保存
  window.addEventListener('beforeunload', async (e) => {
    try {
      const debugData = localStorage.getItem('debugData');
      if (debugData && debugData.trim().length > 0) {
        const parsedDebugData = JSON.parse(debugData);
        
        // 新しいログがある場合のみ保存
        if (parsedDebugData.logs && parsedDebugData.logs.length > lastDebugLogCount) {
          await autoSaveDebugJson(parsedDebugData);
          console.log('[beforeunload] debug.jsonを保存しました');
        }
      }
    } catch (error) {
      console.error('[beforeunload] debug.json保存エラー:', error);
    }
  });
  // ページ読み込み時に統計ポップアップ要素の存在確認
  setTimeout(() => {
    // 統計ポップアップ要素の存在確認
    const statsPopup = document.getElementById('statsPopup');
    const globalStatsPopup = document.getElementById('globalStatsPopup');
    
    if (debugMode && debug) {
      console.log('=== 統計ポップアップ要素の初期化確認 ===');
      console.log('statsPopup:', statsPopup);
      console.log('globalStatsPopup:', globalStatsPopup);
      
      if (statsPopup) {
        console.log('statsPopup初期化完了');
      } else {
        console.warn('statsPopup要素が見つかりません');
      }
      
      if (globalStatsPopup) {
        console.log('globalStatsPopup初期化完了');
      } else {
        console.warn('globalStatsPopup要素が見つかりません');
      }
      
      // デバッグモードがONの場合の初期ヘルプ表示
      console.log('');
      console.log('=== デバッグモードが有効です ===');
      console.log('使用可能なコマンド:');
      console.log('- \\ または ¥ キー: 詳細な統計状況確認画面を表示');
      console.log('- showDebugHelp(): 詳細なヘルプを表示');
      console.log('- setDebugMode(false): デバッグモードをOFFに設定');
    } else if (!debug) {
      // debug変数がfalseの場合は何も表示しない
    } else {
      console.log('=== デバッグモードが無効です ===');
      console.log('デバッグモードを有効にするには: setDebugMode(true)');
      console.log('ヘルプを表示するには: showDebugHelp()');
    }
  }, 100);
});

// 全体設定・統計ポップアップの表示・非表示
window.addEventListener('DOMContentLoaded', function() {
  // 設定ボタン
  const settingsBtn = document.getElementById('settingsBtn');
  const globalSettingsPopup = document.getElementById('globalSettingsPopup');
  const closeGlobalSettingsBtn = document.getElementById('closeGlobalSettingsBtn');
  
  if (settingsBtn && globalSettingsPopup && closeGlobalSettingsBtn) {
    settingsBtn.onclick = async () => {
      globalSettingsPopup.style.display = 'flex';
      
      // 設定値を読み込んでUIに反映
      await loadGlobalSettings();
      
      // ファイルハンドルの状態を更新
      updateFileHandleStatus();
      
      // 高度な設定は常に非表示で開始（隠しボタンで表示）
      const advancedSettings = document.getElementById('advancedSettings');
      if (advancedSettings) {
        advancedSettings.style.display = 'none';
        advancedSettingsEnabled = false; // リセット
      }
    };
    
    closeGlobalSettingsBtn.onclick = () => {
      globalSettingsPopup.style.display = 'none';
      
      // ポップアップを閉じる時に高度な設定も非表示にリセット
      const advancedSettings = document.getElementById('advancedSettings');
      if (advancedSettings) {
        advancedSettings.style.display = 'none';
        advancedSettingsEnabled = false;
      }
    };
  }
  
  // 高度な設定を表示ボタン（隠しボタン、トグル式）
  const showAdvancedBtn = document.getElementById('showAdvancedBtn');
  
  if (showAdvancedBtn) {
    showAdvancedBtn.onclick = function() {
      const advancedSettings = document.getElementById('advancedSettings');
      
      if (!advancedSettings) return;
      
      // 既に表示されている場合は非表示にする
      if (advancedSettingsEnabled) {
        advancedSettings.style.display = 'none';
        advancedSettingsEnabled = false;
        showDebugInfo('高度な設定を非表示にしました');
        return;
      }
      
      // 表示する場合はパスワード入力を求める
      const password = prompt('高度な設定を表示するにはパスワードを入力してください:');
      
      if (!password) {
        return;
      }
      
      // SQLインジェクション対策：禁止文字チェック
      const forbiddenChars = /["',.;:!#$%&()=~|`{+*}<>?_/\\\]\[@\-^\)]/;
      if (forbiddenChars.test(password)) {
        alert('パスワードに使用できない文字が含まれています。\n使用できない文字: " \' , . ; : ! # $ % & ( ) = ~ | ` { + * } < > ? _ / \\ ] [ @ - ^');
        showDebugInfo('パスワード入力エラー: 禁止文字が含まれています');
        return;
      }
      
      // パスワード検証
      if (password === debugpswd) {
        advancedSettings.style.display = 'block';
        advancedSettingsEnabled = true;
        showDebugInfo('高度な設定を表示しました');
      } else {
        alert('パスワードが正しくありません。');
        showDebugInfo('高度な設定: パスワード認証失敗');
      }
    };
  }
  
  // 高度な設定を非表示にするボタン
  const hideAdvancedBtn = document.getElementById('hideAdvancedBtn');
  if (hideAdvancedBtn) {
    hideAdvancedBtn.onclick = function() {
      const advancedSettings = document.getElementById('advancedSettings');
      if (advancedSettings) {
        advancedSettings.style.display = 'none';
        advancedSettingsEnabled = false;
        showDebugInfo('高度な設定を非表示にしました');
      }
    };
  }
  
  // デバッグモードトグル
  const debugModeToggle = document.getElementById('debugModeToggle');
  if (debugModeToggle) {
    debugModeToggle.onchange = async function() {
      const newState = this.checked;
      
      // デバッグモードを有効にする場合のみパスワード確認
      if (newState === true) {
        // パスワード確認
        const password = prompt('デバッグモードを有効にするにはパスワードを入力してください:');
        
        if (!password) {
          // キャンセルされた場合は元に戻す
          this.checked = debugMode;
          return;
        }
        
        // SQLインジェクション対策：禁止文字チェック
        const forbiddenChars = /["',.;:!#$%&()=~|`{+*}<>?_/\\\]\[@\-^\)]/;
        if (forbiddenChars.test(password)) {
          alert('パスワードに使用できない文字が含まれています。\n使用できない文字: " \' , . ; : ! # $ % & ( ) = ~ | ` { + * } < > ? _ / \\ ] [ @ - ^');
          this.checked = debugMode;
          showDebugInfo('パスワード入力エラー: 禁止文字が含まれています');
          return;
        }
        
        // パスワード検証
        if (password === debugpswd) {
          await setDebugMode(true);
          showDebugInfo('デバッグモードを有効にしました');
        } else {
          alert('パスワードが正しくありません。');
          this.checked = debugMode; // 元に戻す
          showDebugInfo('デバッグモード有効化: パスワード認証失敗');
        }
      } else {
        // デバッグモードを無効にする場合はパスワード不要
        await setDebugMode(false);
        showDebugInfo('デバッグモードを無効にしました');
      }
    };
  }
  
  // 音量スライダー
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  if (volumeSlider && volumeValue) {
    volumeSlider.oninput = function() {
      const volume = parseInt(this.value);
      volumeValue.textContent = volume;
      speechVolume = volume / 100;
      showDebugInfo(`音量を${volume}%に設定しました`);
    };
  }
  
  // 速度スライダー
  const rateSlider = document.getElementById('rateSlider');
  const rateValue = document.getElementById('rateValue');
  if (rateSlider && rateValue) {
    rateSlider.oninput = function() {
      const rate = parseInt(this.value) / 10; // 1-20 → 0.1-2.0
      rateValue.textContent = rate.toFixed(1);
      speechRate = rate;
      showDebugInfo(`速度を${rate.toFixed(1)}xに設定しました`);
    };
  }
  
  // デバッグ情報表示数のスライダーとインプットの連動
  const debugInfoCountSlider = document.getElementById('debugInfoCountSlider');
  const debugInfoCountInput = document.getElementById('debugInfoCountInput');
  const debugInfoCountValue = document.getElementById('debugInfoCountValue');
  
  if (debugInfoCountSlider && debugInfoCountInput && debugInfoCountValue) {
    // スライダー操作時
    debugInfoCountSlider.oninput = function() {
      const value = parseInt(this.value);
      // 1未満は1に、1000超過は1000に制限
      const clampedValue = Math.max(1, Math.min(1000, value));
      
      debugInfoCountInput.value = clampedValue;
      debugInfoCountValue.textContent = clampedValue;
      debugInfoMaxCount = clampedValue;
      
      showDebugInfo(`デバッグ情報表示数を${clampedValue}件に変更しました`);
    };
    
    // 入力ボックス操作時
    debugInfoCountInput.oninput = function() {
      let value = parseFloat(this.value);
      
      // 小数点以下を切り捨て
      value = Math.floor(value);
      
      // 1未満は1に、1000超過は1000に制限
      const clampedValue = Math.max(1, Math.min(1000, value));
      
      // 値が有効な数値の場合のみ更新
      if (!isNaN(clampedValue)) {
        this.value = clampedValue;
        debugInfoCountSlider.value = clampedValue;
        debugInfoCountValue.textContent = clampedValue;
        debugInfoMaxCount = clampedValue;
        
        showDebugInfo(`デバッグ情報表示数を${clampedValue}件に変更しました`);
      }
    };
    
    // フォーカスが外れた時に値を正規化
    debugInfoCountInput.onblur = function() {
      let value = parseFloat(this.value);
      
      // 空欄やNaNの場合はデフォルト値(5)に設定
      if (isNaN(value) || this.value.trim() === '') {
        value = 5;
      }
      
      // 小数点以下を切り捨て
      value = Math.floor(value);
      
      // 1未満は1に、1000超過は1000に制限
      const clampedValue = Math.max(1, Math.min(1000, value));
      
      this.value = clampedValue;
      debugInfoCountSlider.value = clampedValue;
      debugInfoCountValue.textContent = clampedValue;
      debugInfoMaxCount = clampedValue;
    };
  }
  
  // 全体設定保存ボタン
  const saveGlobalSettingsBtn = document.getElementById('saveGlobalSettingsBtn');
  if (saveGlobalSettingsBtn) {
    saveGlobalSettingsBtn.onclick = async function() {
      await saveGlobalSettings();
      alert('設定を保存しました');
      globalSettingsPopup.style.display = 'none';
    };
  }
  
  // ファイルハンドル設定ボタン（設定ポップアップ内）
  const setupFilesBtnInSettings = document.getElementById('setupFilesBtn');
  if (setupFilesBtnInSettings) {
    setupFilesBtnInSettings.onclick = async function() {
      const success = await setupAllFileHandles();
      if (success) {
        // 設定完了フラグを保存
        localStorage.setItem('fileHandlesConfigured', 'true');
        showDebugInfo('ファイルハンドルの設定が完了しました');
        
        // ステータス表示を更新
        updateFileHandleStatus();
        
        alert('ファイルハンドルの設定が完了しました');
      }
    };
  }
  
  // ファイルハンドルリセットボタン
  const resetFileHandlesBtn = document.getElementById('resetFileHandlesBtn');
  if (resetFileHandlesBtn) {
    resetFileHandlesBtn.onclick = function() {
      const confirm = window.confirm(
        'ファイルハンドルの設定をリセットしますか？\n\n' +
        '※ リセット後、次回起動時に再度設定が必要になります。\n' +
        '※ 既存のJSONファイルのデータは削除されません。'
      );
      
      if (confirm) {
        // ファイルハンドルをクリア
        fileHandles.progress = null;
        fileHandles.settings = null;
        fileHandles.sessions = null;
        fileHandles.data = null;
        fileHandles.debug = null;
        
        // フラグをクリア
        localStorage.removeItem('fileHandlesConfigured');
        
        showDebugInfo('ファイルハンドルの設定をリセットしました');
        
        // ステータス表示を更新
        updateFileHandleStatus();
        
        alert('ファイルハンドルの設定をリセットしました。\n次回起動時に再度設定してください。');
      }
    };
  }
  
  // ファイルハンドル状態を更新する関数
  window.updateFileHandleStatus = function() {
    const fileHandleStatus = document.getElementById('fileHandleStatus');
    const setupFilesBtn = document.getElementById('setupFilesBtn');
    
    if (fileHandleStatus && setupFilesBtn) {
      const hasAnyFileHandle = Object.values(fileHandles).some(handle => handle !== null);
      const configured = localStorage.getItem('fileHandlesConfigured');
      
      if (hasAnyFileHandle || configured === 'true') {
        fileHandleStatus.style.display = 'block';
        setupFilesBtn.textContent = '📁 ファイルハンドルを再設定';
        showDebugInfo('ファイルハンドル状態: 設定済み');
      } else {
        fileHandleStatus.style.display = 'none';
        setupFilesBtn.textContent = '📁 ファイルハンドルを設定';
        showDebugInfo('ファイルハンドル状態: 未設定');
      }
    }
  };
  
  // 全体データ削除ボタン
  const globalDeleteProgressBtn = document.getElementById('globalDeleteProgressBtn');
  if (globalDeleteProgressBtn) {
    globalDeleteProgressBtn.onclick = async function() {
      await deleteProgress();
    };
  }
  
  // 設定リセットボタン
  const resetGlobalSettingsBtn = document.getElementById('resetGlobalSettingsBtn');
  if (resetGlobalSettingsBtn) {
    resetGlobalSettingsBtn.onclick = async function() {
      const confirmed = confirm(
        '全体設定をリセットしますか？\n\n' +
        '以下の設定がデフォルト値に戻ります：\n' +
        '• 音量: 100%\n' +
        '• 速度: 1.0倍速\n' +
        '• 初出問題数: 10問\n' +
        '• 復習問題数: 10問\n' +
        '• 問題フォントサイズ: 32px\n' +
        '• デバッグ情報表示数: 5件\n\n' +
        '※ 学習データ・ファイルハンドル設定は保持されます\n' +
        '※ デバッグモードは無効になります'
      );
      
      if (!confirmed) {
        return;
      }
      
      showDebugInfo('=== 設定をリセット中 ===');
      
      // デフォルト設定を作成
      const defaultSettings = {
        version: "1.0",
        debugMode: false,
        speechVolume: 1.0,
        speechRate: 1.0,
        defaultNewWordCount: 10,
        defaultReviewWordCount: 10,
        defaultQuestionFontSize: 32,
        debugInfoMaxCount: 5,
        newWordCount: 10,
        reviewWordCount: 10,
        questionFontSize: 32,
        loginStreak: parseInt(localStorage.getItem('loginStreak') || '0', 10),
        lastLoginDate: localStorage.getItem('lastLoginDate') || '',
        totalXP: totalXP,
        currentLevel: currentLevel
      };
      
      // グローバル変数を更新
      debugMode = false;
      speechVolume = 1.0;
      speechRate = 1.0;
      defaultNewWordCount = 10;
      defaultReviewWordCount = 10;
      defaultQuestionFontSize = 32;
      debugInfoMaxCount = 5;
      newWordCount = 10;
      reviewWordCount = 10;
      questionFontSize = 32;
      
      // settings.jsonに保存
      await saveSettings(defaultSettings);
      
      // UIを更新
      await loadGlobalSettings();
      
      // デバッグモードトグルを更新
      const debugModeToggle = document.getElementById('debugModeToggle');
      if (debugModeToggle) {
        debugModeToggle.checked = false;
      }
      
      // デバッグ情報の表示を更新
      updateDebugInfoVisibility();
      
      showDebugInfo('設定をリセットしました');
      alert('設定をデフォルト値にリセットしました');
    };
  }
  
  // 管理者デバッグを開くボタン
  const openAdminDebugBtn = document.getElementById('openAdminDebugBtn');
  const adminDebugPopup = document.getElementById('adminDebugPopup');
  const closeAdminDebugBtn = document.getElementById('closeAdminDebugBtn');
  
  if (openAdminDebugBtn && adminDebugPopup && closeAdminDebugBtn) {
    openAdminDebugBtn.onclick = async function() {
      // 管理者パスワード確認
      const password = prompt('管理者デバッグ機能を開くには管理者パスワードを入力してください:');
      
      if (!password) {
        return;
      }
      
      // SQLインジェクション対策：禁止文字チェック
      const forbiddenChars = /["',.;:!#$%&()=~|`{+*}<>?_/\\\]\[@\-^\)]/;
      if (forbiddenChars.test(password)) {
        alert('パスワードに使用できない文字が含まれています。\n使用できない文字: " \' , . ; : ! # $ % & ( ) = ~ | ` { + * } < > ? _ / \\ ] [ @ - ^');
        showDebugInfo('管理者パスワード入力エラー: 禁止文字が含まれています');
        return;
      }
      
      // パスワード検証
      if (password === adminpswd) {
        // 管理者デバッグポップアップを表示
        adminDebugPopup.style.display = 'flex';
        
        // 現在の値をUIに反映
        await loadAdminDebugValues();
        
        showDebugInfo('管理者デバッグ機能を開きました');
      } else {
        alert('管理者パスワードが正しくありません。');
        showDebugInfo('管理者デバッグ機能: パスワード認証失敗');
      }
    };
    
    closeAdminDebugBtn.onclick = function() {
      adminDebugPopup.style.display = 'none';
    };
  }
  
  // XP・レベル適用ボタン
  const applyXPChangesBtn = document.getElementById('applyXPChangesBtn');
  if (applyXPChangesBtn) {
    applyXPChangesBtn.onclick = async function() {
      const newTotalXP = parseInt(document.getElementById('adminTotalXP').value);
      const newLevel = parseInt(document.getElementById('adminCurrentLevel').value);
      
      const oldTotalXP = totalXP;
      const oldLevel = currentLevel;
      
      // 管理者編集を記録
      await saveAdminEditToDebugJson('XP_LEVEL_EDIT', 
        { totalXP: oldTotalXP, currentLevel: oldLevel },
        { totalXP: newTotalXP, currentLevel: newLevel },
        { note: '管理者によるXP・レベルの手動編集' }
      );
      
      // 値を適用（localStorage）
      totalXP = newTotalXP;
      currentLevel = newLevel;
      localStorage.setItem('totalXP', totalXP.toString());
      localStorage.setItem('currentLevel', currentLevel.toString());
      
      // 次のレベルXPを計算
      const calculatedNextLevelXP = Math.floor(Math.pow(1.2, currentLevel));
      const minimumNextLevelXP = 10;
      nextLevelXP = Math.max(calculatedNextLevelXP, minimumNextLevelXP);
      
      // 表示を更新
      updateXPDisplay();
      
      showDebugInfo(`XP・レベルを更新: XP=${totalXP}, レベル=${currentLevel}`);
      alert(`XP・レベルを更新しました。\n総XP: ${totalXP}\nレベル: ${currentLevel}\n\n※ この変更はdebug.jsonに記録されました`);
    };
  }
  
  // 連続記録適用ボタン
  const applyStreakChangesBtn = document.getElementById('applyStreakChangesBtn');
  if (applyStreakChangesBtn) {
    applyStreakChangesBtn.onclick = async function() {
      const newStreak = parseInt(document.getElementById('adminLoginStreak').value);
      const newLastDate = document.getElementById('adminLastLoginDate').value;
      
      const oldStreak = parseInt(localStorage.getItem('loginStreak') || '0', 10);
      const oldLastDate = localStorage.getItem('lastLoginDate') || '';
      
      // 管理者編集を記録
      await saveAdminEditToDebugJson('LOGIN_STREAK_EDIT',
        { loginStreak: oldStreak, lastLoginDate: oldLastDate },
        { loginStreak: newStreak, lastLoginDate: newLastDate },
        { note: '管理者による連続記録の手動編集' }
      );
      
      // 値を適用（localStorage）
      localStorage.setItem('loginStreak', newStreak.toString());
      localStorage.setItem('lastLoginDate', newLastDate);
      
      // 表示を更新
      updateStreakDisplay();
      
      showDebugInfo(`連続記録を更新: ${newStreak}日, 最終学習日=${newLastDate}`);
      alert(`連続記録を更新しました。\n連続学習日数: ${newStreak}日\n最終学習日: ${newLastDate}\n\n※ この変更はdebug.jsonに記録されました`);
    };
  }
  
  // 単語データ読み込みボタン
  const loadWordDataBtn = document.getElementById('loadWordDataBtn');
  if (loadWordDataBtn) {
    loadWordDataBtn.onclick = function() {
      const adminWordSelect = document.getElementById('adminWordSelect');
      const selectedWord = adminWordSelect?.value;
      
      if (!selectedWord) {
        alert('単語を選択してください');
        return;
      }
      
      const wordProgress = progressData[selectedWord];
      const adminWordCorrect = document.getElementById('adminWordCorrect');
      const adminWordWrong = document.getElementById('adminWordWrong');
      
      if (wordProgress) {
        // 履歴から正確に計算
        const correctCount = wordProgress.history ? 
          wordProgress.history.filter(h => h.grade === 'easy' || h.grade === 'normal').length : 0;
        const wrongCount = wordProgress.history ? 
          wordProgress.history.filter(h => h.grade === 'again' || h.grade === 'hard').length : 0;
        
        if (adminWordCorrect) adminWordCorrect.value = correctCount;
        if (adminWordWrong) adminWordWrong.value = wrongCount;
        
        showDebugInfo(`単語データ読み込み: ${selectedWord} - 正解${correctCount}, 間違い${wrongCount}`);
      } else {
        if (adminWordCorrect) adminWordCorrect.value = 0;
        if (adminWordWrong) adminWordWrong.value = 0;
        showDebugInfo(`単語データ読み込み: ${selectedWord} - データなし`);
      }
    };
  }
  
  // 単語定着度適用ボタン
  const applyWordChangesBtn = document.getElementById('applyWordChangesBtn');
  if (applyWordChangesBtn) {
    applyWordChangesBtn.onclick = async function() {
      const adminWordSelect = document.getElementById('adminWordSelect');
      const selectedWord = adminWordSelect?.value;
      
      if (!selectedWord) {
        alert('単語を選択してください');
        return;
      }
      
      const newCorrect = parseInt(document.getElementById('adminWordCorrect').value);
      const newWrong = parseInt(document.getElementById('adminWordWrong').value);
      
      const wordProgress = progressData[selectedWord] || { correct: 0, wrong: 0, history: [] };
      const oldCorrect = wordProgress.history ? 
        wordProgress.history.filter(h => h.grade === 'easy' || h.grade === 'normal').length : 0;
      const oldWrong = wordProgress.history ? 
        wordProgress.history.filter(h => h.grade === 'again' || h.grade === 'hard').length : 0;
      
      // 管理者編集を記録
      await saveAdminEditToDebugJson('WORD_RETENTION_EDIT',
        { word: selectedWord, correct: oldCorrect, wrong: oldWrong },
        { word: selectedWord, correct: newCorrect, wrong: newWrong },
        { note: '管理者による単語定着度の手動編集', wordbookHash: getCurrentWordbookHash() }
      );
      
      showDebugInfo(`単語定着度を編集（記録のみ）: ${selectedWord} - 正解${newCorrect}, 間違い${newWrong}`);
      alert(
        `単語定着度の編集をdebug.jsonに記録しました。\n\n` +
        `単語: ${selectedWord}\n` +
        `正解数: ${oldCorrect} → ${newCorrect}\n` +
        `間違い数: ${oldWrong} → ${newWrong}\n\n` +
        `⚠️ 注意: この編集はdebug.jsonにのみ記録され、\n` +
        `実際のprogressDataには反映されません。`
      );
    };
  }
  
  // 統計ボタン
  const globalStatsBtn = document.getElementById('globalStatsBtn');
  const globalStatsPopup = document.getElementById('globalStatsPopup');
  const closeGlobalStatsBtn = document.getElementById('closeGlobalStatsBtn');
  if (globalStatsBtn && globalStatsPopup && closeGlobalStatsBtn) {
    globalStatsBtn.onclick = () => {
      globalStatsPopup.style.display = 'flex';
      drawGlobalStats();
    };
    closeGlobalStatsBtn.onclick = () => {
      globalStatsPopup.style.display = 'none';
    };
  }
  // 期間切替で再描画
  const periodSel = document.getElementById('globalReviewPeriod');
  if (periodSel) {
    periodSel.onchange = drawGlobalStats;
  }
  
  // data.json読み込みボタンのイベントリスナー
  const loadDataJsonBtn = document.getElementById('loadDataJsonBtn');
  if (loadDataJsonBtn) {
    // デバッグモードに応じてボタンの表示を制御
    loadDataJsonBtn.style.display = debugMode ? 'inline-block' : 'none';
    
    loadDataJsonBtn.onclick = async () => {
      // デバッグモードのチェック
      if (!debugMode) {
        alert('data.jsonの手動読み込みはデバッグモードでのみ利用可能です。\n\nデバッグモードを有効にするには、コンソールで以下のコマンドを実行してください:\nsetDebugMode(true)');
        return;
      }
      
      showDebugInfo(`=== 手動data.json読み込み開始 ===`);
      
      try {
        const data = await loadDataJsonFile();
        if (data && data.sessions) {
          // localStorageに保存
          saveSessionData(data);
          showDebugInfo(`data.jsonファイルを読み込みました: ${data.sessions.length}件のセッション`);
          
          // XPを更新
          calculateAndUpdateXP();
          showDebugInfo(`XPを更新しました`);
          
          // 連続記録をチェック
          checkAndUpdateLoginStreak();
          showDebugInfo(`連続記録をチェックしました`);
          
          // 全体統計を再描画
          drawGlobalStats();
          
          // 成功メッセージを表示
          showDataJsonLoadMessage(`data.jsonファイルを読み込みました（${data.sessions.length}件のセッション）`);
        } else {
          showDebugInfo('data.jsonファイルの読み込みに失敗しました: データが無効です');
          alert('data.jsonファイルの読み込みに失敗しました: データが無効です');
        }
      } catch (error) {
        showDebugInfo(`data.json読み込みエラー: ${error.message}`);
        // エラーの詳細を分かりやすく表示
    let errorDetails = error.stack;
    if (errorDetails) {
      // 長いファイルパスを短縮
      errorDetails = errorDetails.replace(/file:\/\/\/[^\/]+(\/[^\/]+)*\//g, '');
      showDebugInfo(`エラーの詳細: ${errorDetails}`);
    }
        
        // デバッグモードの場合は詳細なエラー情報を表示
        if (debugMode) {
          alert(`data.jsonファイルの読み込み中にエラーが発生しました:\n\nエラー: ${error.message}\n\n詳細はデバッグ情報を確認してください。`);
        } else {
          alert(`data.jsonファイルの読み込み中にエラーが発生しました: ${error.message}\n\nデバッグモードを有効にして詳細を確認してください。`);
        }
      }
    };
  }
  
  // debug.jsonダウンロードボタンのイベントリスナー
  const downloadDebugBtn = document.getElementById('downloadDebugBtn');
  if (downloadDebugBtn) {
    downloadDebugBtn.onclick = async () => {
      try {
        // localStorageからデバッグデータを取得
        const debugData = localStorage.getItem('debugData');
        if (!debugData || debugData.trim().length === 0) {
          alert('デバッグデータがありません。新しいデバッグログを作成します。');
          // 空のデバッグデータを作成
          const emptyDebugData = { logs: [] };
          localStorage.setItem('debugData', JSON.stringify(emptyDebugData));
          return;
        }
        
        // 既存のdebug.jsonファイルがあるかチェック
        let shouldMerge = false;
        if (window.location.protocol !== 'file:') {
          try {
            const response = await fetch('./debug.json');
            if (response.ok) {
              const content = await response.text();
              // 空のファイルでない場合のみマージを提案
              if (content && content.trim().length > 0) {
                const choice = confirm('既存のdebug.jsonファイルが見つかりました。\n\n「OK」: 既存ファイルに内容を追加\n「キャンセル」: 新しいファイルとして保存');
                shouldMerge = choice;
              }
            }
          } catch (e) {
            // 既存ファイルがない場合はそのまま続行
          }
        }
        
        let finalDebugData = { logs: [] };
        try {
          finalDebugData = JSON.parse(debugData);
          // データ構造の検証
          if (!finalDebugData || typeof finalDebugData !== 'object') {
            finalDebugData = { logs: [] };
          }
          if (!finalDebugData.logs || !Array.isArray(finalDebugData.logs)) {
            finalDebugData.logs = [];
          }
        } catch (parseError) {
          console.error('debugDataのJSON解析エラー:', parseError);
          finalDebugData = { logs: [] };
        }
        
        if (shouldMerge) {
          try {
            const response = await fetch('./debug.json');
            const content = await response.text();
            
            // 空のファイルでない場合のみマージ
            if (content && content.trim().length > 0) {
              let existingDebugData = { logs: [] };
              
              try {
                existingDebugData = JSON.parse(content);
                
                // データ構造の検証
                if (!existingDebugData || typeof existingDebugData !== 'object') {
                  existingDebugData = { logs: [] };
                }
                if (!existingDebugData.logs || !Array.isArray(existingDebugData.logs)) {
                  existingDebugData.logs = [];
                }
              } catch (parseError) {
                showDebugInfo(`既存debug.jsonのJSON解析エラー: ${parseError.message}`);
                existingDebugData = { logs: [] };
              }
              
              if (existingDebugData.logs && Array.isArray(existingDebugData.logs)) {
                // 既存のログと現在のログをマージ
                const mergedLogs = [...existingDebugData.logs, ...finalDebugData.logs];
                
                // 重複を除去（同じtimestampとmessageの組み合わせ）
                const uniqueLogs = mergedLogs.filter((log, index, self) => 
                  index === self.findIndex(l => l.timestamp === log.timestamp && l.message === log.message)
                );
                
                // タイムスタンプでソート
                uniqueLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                // ログの最大数を制限（最新1000件）
                const finalLogs = uniqueLogs.length > 1000 ? uniqueLogs.slice(-1000) : uniqueLogs;
                
                finalDebugData = { logs: finalLogs };
                showDebugInfo(`既存のdebug.jsonファイルに内容を追加しました: ${finalLogs.length}件のログ`);
              }
            } else {
              showDebugInfo(`既存のdebug.jsonが空です: 現在のデータのみ保存します`);
            }
          } catch (mergeError) {
            showDebugInfo(`既存ファイルとのマージエラー: ${mergeError.message}`);
            alert('既存ファイルとのマージ中にエラーが発生しました。新しいファイルとして保存します。');
          }
        }
        
        // File System Access APIを使用してファイルに保存
        try {
          if (!window.showSaveFilePicker) {
            throw new Error('File System Access APIがサポートされていません');
          }
          
          // ファイルハンドルを取得（またはキャッシュを使用）
          let fileHandle = fileHandles.debug;
          
          if (!fileHandle) {
            // file://プロトコルの場合は、setupAllFileHandles()での設定を促す
            if (window.location.protocol === 'file:') {
              const useSetup = confirm(
                'debug.jsonのファイルハンドルが設定されていません。\n\n' +
                '【推奨】「OK」: ファイルハンドルを一括設定（今後は自動保存）\n' +
                '【非推奨】「キャンセル」: 今回だけファイルを選択（毎回ダウンロード必要）\n\n' +
                '※ 一括設定を選ぶと、今後はダウンロード不要で自動保存されます'
              );
              
              if (useSetup) {
                // ファイルハンドルを一括設定
                const success = await setupAllFileHandles();
                if (success) {
                  fileHandle = fileHandles.debug;
                  showDebugInfo('ファイルハンドルを一括設定しました');
                } else {
                  showDebugInfo('ファイルハンドル設定がキャンセルされました');
                  return;
                }
              } else {
                // 今回だけファイルを選択
                fileHandle = await window.showSaveFilePicker({
                  suggestedName: 'debug.json',
                  types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                  }]
                });
                
                showDebugInfo(`debug.jsonファイルを選択: ${fileHandle.name}（一時的）`);
              }
            } else {
              // HTTPプロトコルの場合
              fileHandle = await window.showSaveFilePicker({
                suggestedName: 'debug.json',
                types: [{
                  description: 'JSON Files',
                  accept: { 'application/json': ['.json'] }
                }]
              });
              
              // ファイルハンドルを保存（今後の自動保存用）
              fileHandles.debug = fileHandle;
              showDebugInfo(`debug.jsonファイルハンドルを保存: ${fileHandle.name}`);
            }
          }
          
          if (!fileHandle) {
            showDebugInfo('ファイルハンドルが取得できませんでした');
            return;
          }
          
          // ファイルに書き込み
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(finalDebugData, null, 2));
          await writable.close();
          
          // 保存時刻とログ数を更新
          lastDebugSaveTime = Date.now();
          lastDebugLogCount = finalDebugData.logs.length;
          
          showDebugInfo(`debug.jsonファイルに保存しました: ${fileHandle.name} (${finalDebugData.logs.length}件)`);
          
          // file://プロトコルで永続的なハンドルの場合
          if (window.location.protocol === 'file:' && fileHandles.debug) {
            alert(`debug.jsonに保存しました（${finalDebugData.logs.length}件のログ）\n\n✅ 同じフォルダ内のファイルに保存されました\n以降は自動的にこのファイルに保存されます`);
          } else {
            alert(`debug.jsonファイルに保存しました（${finalDebugData.logs.length}件のログ）`);
          }
          
        } catch (fileError) {
          if (fileError.name === 'AbortError') {
            showDebugInfo('debug.jsonの保存がキャンセルされました');
          } else {
            showDebugInfo(`File System Access APIエラー: ${fileError.message}`);
            
            // フォールバック: 従来のダウンロード方式
            const blob = new Blob([JSON.stringify(finalDebugData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'debug.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showDebugInfo('debug.jsonファイルをダウンロードしました（フォールバック）');
            alert('debug.jsonファイルをダウンロードしました');
          }
        }
      } catch (error) {
        showDebugInfo(`debug.jsonダウンロードエラー: ${error.message}`);
        alert(`debug.jsonファイルのダウンロード中にエラーが発生しました: ${error.message}`);
      }
    };
  }
});

function updateInitialDisplay() {
  document.getElementById("question").textContent = "CSVファイルを選択して学習を開始してください";
  document.getElementById("answer").textContent = "ファイル形式: 問題,答え（カンマ区切り）";
  document.getElementById("showAnswerBtn").style.display = "inline-block";
  document.getElementById("showAnswerBtn").textContent = "ファイルを選択してください";
  document.getElementById("showAnswerBtn").disabled = true;
  document.getElementById("gradeButtons").style.display = "none";
  document.getElementById("memoSection").style.display = "none";
  document.getElementById("statusText").textContent = "ファイルを選択してください";
  document.getElementById("progressFill").style.width = "0%";
  // メニュー画面時はメモボタン非表示
  document.getElementById("memoToggleBtn").style.display = 'none';
  document.getElementById("progressBar").style.display = 'none';
  document.getElementById("statusText").style.display = 'none';
}

function updateDebugInfoVisibility() {
  const debugInfo = document.getElementById("debugInfo");
  if (debugInfo) debugInfo.style.display = debugMode ? "block" : "none";
}

async function handleFile(event) {
  showDebugInfo(`=== handleFile呼び出し ===`);
  showDebugInfo(`event.target: ${event.target}`);
  showDebugInfo(`event.target.files: ${event.target.files}`);
  showDebugInfo(`event.target.files.length: ${event.target.files ? event.target.files.length : 'なし'}`);
  
  const file = event.target.files[0];
  
  if (!file) {
    showDebugInfo("エラー: ファイルが選択されていません");
    alert("ファイルを選択してください");
    return;
  }
  
  showDebugInfo(`ファイル選択: ${file.name} (${file.size} bytes)`);
  
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    showDebugInfo("ファイル読み込み完了");
    const content = e.target.result;
    showDebugInfo(`ファイル内容: ${content.substring(0, 50)}...`);
    
    // 履歴に追加
    showDebugInfo(`履歴に追加を開始: ${file.name}`);
    await addHistoryEntry(file.name, content);
    showDebugInfo(`履歴に追加完了: ${file.name}`);

    const lines = content.split("\n").map(line => line.trim()).filter(line => line);
    showDebugInfo(`読み込まれた行数: ${lines.length}`);
    
    allWords = lines.map((line, index) => {
      const parts = line.split(",");
      const question = parts[0];
      const answer = parts[1];
      const reading = parts[2]; // 3つ目があれば読み上げ用
      if (!question || !answer) {
        showDebugInfo(`警告: 行 ${index + 1} の形式が正しくありません: ${line}`);
        return null;
      }
      // 読み上げがあれば追加
      return reading !== undefined
        ? { question: question.trim(), answer: answer.trim(), reading: reading.trim() }
        : { question: question.trim(), answer: answer.trim() };
    }).filter(word => word !== null);
    
    showDebugInfo(`有効な単語数: ${allWords.length}`);
    
    if (allWords.length === 0) {
      showDebugInfo("エラー: 有効なデータが見つかりませんでした");
      alert("有効なデータが見つかりませんでした。CSVファイルの形式を確認してください。\n形式: 問題,答え");
      return;
    }
    
    // 同じフォルダ内の他のCSVファイルを自動検出
    showDebugInfo(`CSV自動検出を開始`);
    await detectAndAddOtherCsvFiles(file);
    showDebugInfo(`CSV自動検出完了`);
    
    // クイズは開始せず、メニュー画面を更新して表示する
    showDebugInfo(`メニュー画面を表示します`);
    await showMenuScreen();
    showDebugInfo(`メニュー画面の表示完了`);
    
    // ファイル入力をリセット（次回も同じファイルを選択できるように）
    event.target.value = '';
    showDebugInfo(`ファイル入力をリセットしました`);
  };
  
  reader.onerror = (error) => {
    showDebugInfo(`エラー: ファイル読み込みに失敗 - ${error}`);
    alert("ファイルの読み込みに失敗しました");
  };
  
  showDebugInfo(`FileReaderでファイルを読み込み開始: ${file.name}`);
  reader.readAsText(file, 'UTF-8');
}

// 同じフォルダ内の他のCSVファイルを検出して自動追加する関数
// 単語帳が一つもない場合に同じフォルダ内のCSVファイルを自動読み込み
async function autoLoadCsvFilesFromFolder() {
  showDebugInfo(`=== CSVファイル自動読み込み開始 ===`);
  
  try {
    // File System Access APIがサポートされているかチェック
    if (!window.showDirectoryPicker) {
      showDebugInfo(`Directory Picker APIがサポートされていません: スキップ`);
      return 0;
    }
    
    const protocol = window.location.protocol;
    
    // HTTPプロトコルの場合はスキップ
    if (protocol === 'http:' || protocol === 'https:') {
      showDebugInfo(`HTTPプロトコル: CSVファイルの自動読み込みをスキップ`);
      return 0;
    }
    
    // ユーザーに確認（自動検出のため、よりわかりやすいメッセージ）
    const shouldScan = confirm(
      '単語帳の履歴がありません。\n\n' +
      '同じフォルダ内のCSVファイルを自動的に読み込みますか？\n\n' +
      '「OK」: フォルダを選択して全てのCSVファイルを読み込み\n' +
      '「キャンセル」: 手動でファイルを選択'
    );
    
    if (!shouldScan) {
      showDebugInfo(`ユーザーがCSV自動読み込みをキャンセルしました`);
      return 0;
    }
    
    // ディレクトリを選択
    const dirHandle = await window.showDirectoryPicker();
    showDebugInfo(`ディレクトリを選択: ${dirHandle.name}`);
    
    let addedCount = 0;
    let skippedCount = 0;
    
    // ディレクトリ内のファイルを走査
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.csv')) {
        showDebugInfo(`CSVファイル発見: ${entry.name}`);
        
        try {
          const file = await entry.getFile();
          const content = await file.text();
          
          // ハッシュをチェック
          const hash = hashString(content);
          const list = await getHistoryList();
          const existing = list.find(e => e.hash === hash);
          
          if (!existing) {
            // 新規CSVファイルを追加
            await addHistoryEntry(entry.name, content);
            addedCount++;
            showDebugInfo(`追加: ${entry.name}`);
          } else {
            skippedCount++;
            showDebugInfo(`スキップ (既存): ${entry.name}`);
          }
        } catch (fileError) {
          showDebugInfo(`ファイル読み込みエラー (${entry.name}): ${fileError.message}`);
        }
      }
    }
    
    showDebugInfo(`=== CSV自動読み込み完了: ${addedCount}件追加, ${skippedCount}件スキップ ===`);
    
    if (addedCount > 0) {
      alert(`${addedCount}件のCSVファイルを自動的に読み込みました`);
    } else {
      showDebugInfo(`読み込めるCSVファイルはありませんでした`);
    }
    
    return addedCount;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      showDebugInfo(`ディレクトリ選択がキャンセルされました`);
    } else {
      showDebugInfo(`CSV自動読み込みエラー: ${error.message}`);
    }
    return 0;
  }
}

// 同じフォルダ内の他のCSVファイルを検出して自動追加する関数
async function detectAndAddOtherCsvFiles(selectedFile) {
  showDebugInfo(`=== 同じフォルダ内のCSVファイル自動検出開始 ===`);
  
  try {
    // File System Access APIがサポートされているかチェック
    if (!window.showDirectoryPicker) {
      showDebugInfo(`Directory Picker APIがサポートされていません: スキップ`);
      return;
    }
    
    const protocol = window.location.protocol;
    
    // HTTPプロトコルの場合はスキップ
    if (protocol === 'http:' || protocol === 'https:') {
      showDebugInfo(`HTTPプロトコル: CSVファイルの自動検出をスキップ`);
      return;
    }
    
    // ユーザーに確認
    const shouldScan = confirm('同じフォルダ内の他のCSVファイルを自動的に履歴に追加しますか？\n\n「OK」: フォルダを選択して自動追加\n「キャンセル」: スキップ');
    
    if (!shouldScan) {
      showDebugInfo(`ユーザーがCSV自動追加をキャンセルしました`);
      return;
    }
    
    // ディレクトリを選択
    const dirHandle = await window.showDirectoryPicker();
    showDebugInfo(`ディレクトリを選択: ${dirHandle.name}`);
    
    let addedCount = 0;
    let skippedCount = 0;
    
    // ディレクトリ内のファイルを走査
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.csv')) {
        showDebugInfo(`CSVファイル発見: ${entry.name}`);
        
        try {
          const file = await entry.getFile();
          const content = await file.text();
          
          // ハッシュをチェック
          const hash = hashString(content);
          const list = await getHistoryList();
          const existing = list.find(e => e.hash === hash);
          
          if (!existing) {
            // 新規CSVファイルを追加
            await addHistoryEntry(entry.name, content);
            addedCount++;
            showDebugInfo(`追加: ${entry.name}`);
          } else {
            skippedCount++;
            showDebugInfo(`スキップ (既存): ${entry.name}`);
          }
        } catch (fileError) {
          showDebugInfo(`ファイル読み込みエラー (${entry.name}): ${fileError.message}`);
        }
      }
    }
    
    showDebugInfo(`=== CSV自動追加完了: ${addedCount}件追加, ${skippedCount}件スキップ ===`);
    
    if (addedCount > 0) {
      alert(`${addedCount}件のCSVファイルを履歴に追加しました`);
      // メニュー画面を更新
      await showMenuScreen();
    } else {
      showDebugInfo(`新しいCSVファイルはありませんでした`);
    }
    
  } catch (error) {
    if (error.name === 'AbortError') {
      showDebugInfo(`ディレクトリ選択がキャンセルされました`);
    } else {
      showDebugInfo(`CSV自動検出エラー: ${error.message}`);
    }
  }
}

async function loadProgress() {
  const currentHash = getCurrentWordbookHash();
  
  // progress.jsonから進捗データを読み込み（ファイル選択なし）
  const progressFileData = await loadProgressData(true);
  const allProgress = progressFileData.allProgress || {};
  
  if (currentHash && allProgress[currentHash]) {
    progressData = allProgress[currentHash];
  } else {
    progressData = {};
  }
  
  // 設定をsettings.jsonから読み込み（ファイル選択なし）
  const settings = await loadSettings(true);
  if (settings) {
    if (settings.newWordCount) newWordCount = settings.newWordCount;
    if (settings.reviewWordCount) reviewWordCount = settings.reviewWordCount;
    if (settings.questionFontSize) questionFontSize = settings.questionFontSize;
    if (debug) {
      debugMode = settings.debugMode !== undefined ? settings.debugMode : false;
    } else {
      debugMode = false;
    }
  }

  // 個別設定を読み込み
  const history = progressFileData.wordbookHistory || [];
  const entry = history.find(e => e.hash === currentHash);
  if (entry && entry.settings) {
    newWordCount = entry.settings.newCount || newWordCount;
    reviewWordCount = entry.settings.reviewCount || reviewWordCount;
    questionFontSize = entry.settings.fontSize || questionFontSize;
  }
}

function loadFontSizeSetting() {
  // 設定パネルの値を反映
  const input = document.getElementById("questionFontSize");
  if (input) input.value = questionFontSize;
  applyQuestionFontSize();
}

function applyQuestionFontSize() {
  const q = document.getElementById("question");
  if (q) q.style.fontSize = questionFontSize + "px";
}

// 単語の優先度を計算する関数
function calculateWordPriority(word) {
  const progress = progressData[word.question];
  if (!progress || !progress.history || progress.history.length === 0) {
    return 1.0; // 新出単語は優先度1.0
  }
  
  // 重みの定義（優先度の範囲に合わせて調整）
  const gradeWeights = {
    'hard': 1.5,    // 1.2~1.5
    'again': 1.1,   // 1.0~1.2
    'normal': 0.75, // 0.5~1.0
    'easy': 0.25    // ~0.5
  };
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  // 履歴を新しい順に処理（最新が最初）
  const history = progress.history.slice().reverse();
  
  // 計算過程の詳細ログ
  let calculationLog = [];
  
  history.forEach((record, index) => {
    const grade = record.grade;
    const weight = Math.pow(0.5, index); // 0.5^(x-1) ただしxは何個前の記録か
    const gradeWeight = gradeWeights[grade] || 0;
    const contribution = gradeWeight * weight;
    
    weightedSum += contribution;
    totalWeight += weight;
    
    calculationLog.push(`${grade}(${gradeWeight}) × ${weight.toFixed(3)} = ${contribution.toFixed(3)}`);
  });
  
  // 優先度 = 重み付き合計 / 重みの合計
  const priority = totalWeight > 0 ? weightedSum / totalWeight : 1.0;
  
  // 優先度の範囲を制限（0.1 ~ 1.5）
  const clampedPriority = Math.max(0.1, Math.min(1.5, priority));
  
  showDebugInfo(`単語: ${word.question}`);
  showDebugInfo(`  履歴: ${history.map(h => h.grade).join(' → ')}`);
  showDebugInfo(`  計算: ${calculationLog.join(' + ')} = ${weightedSum.toFixed(3)}`);
  showDebugInfo(`  重み合計: ${totalWeight.toFixed(3)}`);
  showDebugInfo(`  計算優先度: ${priority.toFixed(4)}`);
  showDebugInfo(`  制限後優先度: ${clampedPriority.toFixed(4)}`);
  
  return clampedPriority;
}

// 優先度に基づいてカテゴリを判定する関数
function getPriorityCategory(priority) {
  if (priority < 0.5) {
    return 'easy';
  } else if (priority < 1.0) {
    return 'normal';
  } else if (priority < 1.2) {
    return 'again';
  } else {
    return 'hard';
  }
}

// 優先度の詳細情報を表示する関数
function showPriorityInfo(word) {
  const priority = calculateWordPriority(word);
  const category = getPriorityCategory(priority);
  
  showDebugInfo(`=== 優先度情報: ${word.question} ===`);
  showDebugInfo(`優先度: ${priority.toFixed(4)}`);
  showDebugInfo(`カテゴリ: ${category}`);
  showDebugInfo(`範囲: ${getPriorityRange(category)}`);
  
  return { priority, category };
}

// カテゴリの範囲を取得する関数
function getPriorityRange(category) {
  const ranges = {
    'easy': '~0.5',
    'normal': '0.5~1.0',
    'again': '1.0~1.2',
    'hard': '1.2~'
  };
  return ranges[category] || '不明';
}

// 単語を優先度順にソートする関数
function sortWordsByPriority(words) {
  return words.sort((a, b) => {
    const priorityA = calculateWordPriority(a);
    const priorityB = calculateWordPriority(b);
    return priorityB - priorityA; // 優先度の高い順
  });
}

// 一か月以上出題されていない問題を取得する関数
function getOldQuestions(words, months = 1) {
  const now = Date.now();
  const oneMonthAgo = now - (months * 30 * 24 * 60 * 60 * 1000); // 一か月前のタイムスタンプ
  
  const oldQuestions = words.filter(word => {
    const progress = progressData[word.question];
    if (!progress || !progress.history || progress.history.length === 0) {
      return false; // 学習履歴がない場合は除外
    }
    
    // 最新の学習履歴を取得
    const latestHistory = progress.history[progress.history.length - 1];
    const lastLearned = latestHistory.timestamp;
    
    // 一か月以上前の学習履歴があるかチェック
    return lastLearned < oneMonthAgo;
  });
  
  showDebugInfo(`一か月以上出題されていない問題: ${oldQuestions.length}個`);
  oldQuestions.forEach(word => {
    const progress = progressData[word.question];
    const latestHistory = progress.history[progress.history.length - 1];
    const daysAgo = Math.floor((now - latestHistory.timestamp) / (1000 * 60 * 60 * 24));
    showDebugInfo(`  ${word.question}: ${daysAgo}日前`);
  });
  
  return oldQuestions;
}

function prepareQuiz() {
  showDebugInfo("クイズ準備開始");
  showDebugInfo(`総単語数: ${allWords.length}`);
  
  const reviewed = allWords.filter(word => progressData[word.question]);
  const newWords = allWords.filter(word => !progressData[word.question]);
  
  showDebugInfo(`復習単語数: ${reviewed.length}, 新出単語数: ${newWords.length}`);

  // 復習単語を優先度順にソート
  const sortedReviewed = sortWordsByPriority(reviewed);
  
  // 優先度順の詳細情報を表示
  if (sortedReviewed.length > 0) {
    showDebugInfo('=== 復習単語の優先度順 ===');
    sortedReviewed.forEach((word, index) => {
      const priority = calculateWordPriority(word);
      const category = getPriorityCategory(priority);
      showDebugInfo(`${index + 1}. ${word.question}: 優先度${priority.toFixed(4)} (${category}: ${getPriorityRange(category)})`);
    });
  }
  
  // 一か月以上出題されていない問題を取得
  const oldQuestions = getOldQuestions(reviewed);
  
  // 復習問題数の一割を「しばらく出されていない問題」の出題枠にする（最大10問）
  const oldQuestionSlot = Math.min(Math.floor(reviewWordCount * 0.1), 10);
  const actualOldQuestions = oldQuestions.slice(0, oldQuestionSlot);
  
  showDebugInfo(`しばらく出されていない問題枠: ${oldQuestionSlot}問`);
  showDebugInfo(`実際に選択された古い問題: ${actualOldQuestions.length}問`);
  
  // 通常の復習問題から、古い問題と重複しないものを選択
  const remainingReviewCount = reviewWordCount - actualOldQuestions.length;
  const filteredReviewed = sortedReviewed.filter(word => 
    !actualOldQuestions.some(old => old.question === word.question)
  );
  const selectedReview = filteredReviewed.slice(0, remainingReviewCount);
  
  // 復習問題が足りない場合は新出単語で補う
  const actualReviewCount = selectedReview.length + actualOldQuestions.length;
  const reviewShortage = reviewWordCount - actualReviewCount;
  
  showDebugInfo(`復習問題の実際の数: ${actualReviewCount}問 (目標: ${reviewWordCount}問)`);
  showDebugInfo(`復習問題の不足数: ${reviewShortage}問`);
  
  let selectedNew = [];
  let additionalNewForReview = [];
  
  if (reviewShortage > 0) {
    // 復習が足りない分を新出単語で補う
    const totalNewNeeded = newWordCount + reviewShortage;
    showDebugInfo(`新出単語を${totalNewNeeded}個選択します（通常${newWordCount}個 + 復習不足分${reviewShortage}個）`);
    
    const shuffledNew = shuffle(newWords);
    
    // 新出単語が十分にある場合
    if (shuffledNew.length >= totalNewNeeded) {
      selectedNew = shuffledNew.slice(0, newWordCount);
      additionalNewForReview = shuffledNew.slice(newWordCount, totalNewNeeded);
      
      showDebugInfo(`新出単語: ${selectedNew.length}個`);
      showDebugInfo(`復習不足補充用の新出単語: ${additionalNewForReview.length}個`);
    } else {
      // 新出単語も足りない場合は、利用可能な全ての新出単語を使用
      selectedNew = shuffledNew.slice(0, Math.min(newWordCount, shuffledNew.length));
      const remainingNew = shuffledNew.slice(selectedNew.length);
      additionalNewForReview = remainingNew;
      
      showDebugInfo(`新出単語: ${selectedNew.length}個`);
      showDebugInfo(`復習不足補充用の新出単語: ${additionalNewForReview.length}個`);
      showDebugInfo(`警告: 新出単語も不足しています（利用可能: ${shuffledNew.length}個, 必要: ${totalNewNeeded}個）`);
    }
  } else {
    // 通常通り新出単語を選択
    const shuffledNew = shuffle(newWords);
    selectedNew = shuffledNew.slice(0, Math.min(newWordCount, shuffledNew.length));
    showDebugInfo(`新出単語: ${selectedNew.length}個（復習問題は十分）`);
    
    if (selectedNew.length < newWordCount) {
      showDebugInfo(`警告: 新出単語が不足しています（利用可能: ${newWords.length}個, 目標: ${newWordCount}個）`);
    }
  }
  
  showDebugInfo(`選択: 新出${selectedNew.length}個, 復習${selectedReview.length}個, 古い問題${actualOldQuestions.length}個, 復習不足補充${additionalNewForReview.length}個`);
  showDebugInfo(`復習単語の優先度順: ${selectedReview.map(w => w.question).join(', ')}`);
  showDebugInfo(`古い問題: ${actualOldQuestions.map(w => w.question).join(', ')}`);
  if (additionalNewForReview.length > 0) {
    showDebugInfo(`復習不足補充: ${additionalNewForReview.map(w => w.question).join(', ')}`);
  }

  quizQueue = shuffle([...selectedNew, ...selectedReview, ...actualOldQuestions, ...additionalNewForReview]);
  currentIndex = -1; // -1に初期化（最初の問題表示時に0になる）
  wrongList = [];
  correctCount = 0; // 正解数をリセット
  sessionStartTime = Date.now();
  sessionEndTime = null;
  questionTimes = []; // 問題ごとの所要時間をリセット
  lastQuestionTime = null; // 問題開始時刻をリセット
  sessionWrongCounts = {}; // セッション間違い数をリセット
  
  showDebugInfo(`クイズキュー準備完了: ${quizQueue.length}個`);

  // クイズ実行中はファイル選択ボタンを非表示にする（安全策）
  const fileInputLabel = document.getElementById('fileInputLabel');
  if (fileInputLabel) {
    fileInputLabel.style.display = 'none';
    showDebugInfo('ファイル選択ボタンを非表示にしました（クイズ実行中）');
  } else {
    showDebugInfo('警告: fileInputLabel要素が見つかりません');
  }

  updateProgressBar();
  applyQuestionFontSize(); // 追加: 問題表示時にフォントサイズ反映
  showNextQuestion();
  document.getElementById("memoToggleBtn").style.display = '';
}

function showNextQuestion() {
  currentIndex++; // 次の問題のインデックスに進む
  showDebugInfo(`次の問題表示: ${currentIndex}/${quizQueue.length}`);
  
  // 次の問題を表示する前に、現在の問題が最後の問題だったかをチェック
  if (currentIndex >= quizQueue.length) {
    // 最後の問題の回答が完了した後に処理を実行
    sessionEndTime = Date.now();
    showDebugInfo("すべての問題が終了");
    
    updateLoginStreakOnClear(); // 追加: 一周終了時に連続記録更新＆演出
    showResultScreen(); // 結果画面を表示
    return;
  }

  currentWord = quizQueue[currentIndex];
  
  // 問題の開始時刻を記録
  lastQuestionTime = Date.now();
  
  showDebugInfo(`現在の単語: ${currentWord.question}`);

  // クイズ実行中はファイル選択ボタンを非表示にする（安全策）
  const fileInputLabel = document.getElementById('fileInputLabel');
  if (fileInputLabel) {
    fileInputLabel.style.display = 'none';
    showDebugInfo('ファイル選択ボタンを非表示にしました（問題表示中）');
  } else {
    showDebugInfo('警告: fileInputLabel要素が見つかりません');
  }

  document.getElementById("question").textContent = currentWord.question;
  applyQuestionFontSize(); // 追加: 問題表示時にフォントサイズ反映
  document.getElementById("answer").textContent = "（答えを見るボタンを押してください）";
  document.getElementById("showAnswerBtn").style.display = "inline-block";
  document.getElementById("showAnswerBtn").textContent = "答えを見る";
  document.getElementById("showAnswerBtn").disabled = false;
  document.getElementById("gradeButtons").style.display = "none";
  document.getElementById("memoSection").style.display = "none";

  // 読み上げフィールドがあればそれを優先
  speak(currentWord.reading || currentWord.question, "en-US");
}

function showAnswer() {
  if (!currentWord) {
    console.warn("現在の単語が設定されていません。");
    alert("まずCSVファイルを選択してください。");
    return;
  }

  document.getElementById("answer").textContent = currentWord.answer;
  document.getElementById("gradeButtons").style.display = "block";
  // 答えを見るボタンを非表示にする
  document.getElementById("showAnswerBtn").style.display = "none";
  // 答えの読み上げ（3列目があればそれを優先）
  speak(currentWord.reading || currentWord.answer, "ja-JP");
}

function speak(text, lang) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.volume = speechVolume; // 音量を設定
  u.rate = speechRate; // 速度を設定
  speechSynthesis.speak(u);
}

function gradeAnswer(level) {
  const wordKey = currentWord.question;
  if (!progressData[wordKey]) {
    progressData[wordKey] = { correct: 0, wrong: 0, history: [] };
  }
  if (!progressData[wordKey].history) progressData[wordKey].history = [];

  // 現在の問題の所要時間を記録
  if (lastQuestionTime && currentWord) {
    const now = Date.now();
    const questionTime = now - lastQuestionTime;
    questionTimes.push({
      question: currentWord.question,
      time: questionTime
    });
    showDebugInfo(`問題の所要時間を記録: ${currentWord.question} - ${questionTime}ms`);
  }

  // 学習履歴を記録
  progressData[wordKey].history.push({
    timestamp: Date.now(),
    grade: level
  });

  if (level === "again" || level === "hard") {
    // 間違えた場合：間違いリストに追加（重複チェック）
    if (!wrongList.some(w => w.question === currentWord.question)) {
    wrongList.push(currentWord);
      showDebugInfo(`間違いリストに追加: ${currentWord.question}`);
    }
    quizQueue.push(currentWord);
    progressData[wordKey].wrong += 1;
    
    // セッション間違い数を記録
    if (!sessionWrongCounts[wordKey]) {
      sessionWrongCounts[wordKey] = 0;
    }
    sessionWrongCounts[wordKey]++;
    
    showDebugInfo(`セッション間違い数更新: ${wordKey} = ${sessionWrongCounts[wordKey]}`);
    
    // 間違いリストを優先度順にソート
    sortWrongListByPriority();
    
    // 間違えた場合は進捗を進めない
  } else {
    // 正解した場合（easy または normal）
    progressData[wordKey].correct += 1;
    correctCount++; // 正解数を増やす
    
    // 正解した場合は間違いリストから削除
    const wrongIndex = wrongList.findIndex(w => w.question === currentWord.question);
    if (wrongIndex !== -1) {
      wrongList.splice(wrongIndex, 1);
      showDebugInfo(`間違いリストから削除: ${currentWord.question}`);
    }
  }

  saveProgress();
  updateProgressBar(); // 進捗バーを更新
  
  // 最後の問題だったかチェック（次の問題のインデックスが範囲外か）
  if (currentIndex + 1 >= quizQueue.length) {
    showDebugInfo("最後の問題の回答完了 - 結果画面を表示");
    
    sessionEndTime = Date.now();
    updateLoginStreakOnClear(); // 一周終了時に連続記録更新＆演出
    showResultScreen(); // 結果画面を表示
  } else {
    // 次の問題を表示
  showNextQuestion();
  }
}

function saveProgress() {
  const currentHash = getCurrentWordbookHash();
  if (!currentHash) {
    showDebugInfo(`エラー: 現在の単語帳のハッシュが取得できません`);
    return;
  }

  showDebugInfo(`進捗データ保存開始: hash=${currentHash}`);
  showDebugInfo(`保存するprogressData: ${Object.keys(progressData).length}個の単語`);

  let allProgress = JSON.parse(localStorage.getItem("allProgressData") || "{}");
  showDebugInfo(`既存のallProgress: ${Object.keys(allProgress).length}個の単語帳`);
  
  allProgress[currentHash] = progressData;
  showDebugInfo(`更新後のallProgress[${currentHash}]: ${Object.keys(allProgress[currentHash]).length}個の単語`);
  
  localStorage.setItem("allProgressData", JSON.stringify(allProgress));
  
  // 保存確認
  try {
    const savedData = localStorage.getItem("allProgressData");
    const parsedData = JSON.parse(savedData);
    showDebugInfo(`保存確認: localStorageに${Object.keys(parsedData).length}個の単語帳が保存されました`);
    if (parsedData[currentHash]) {
      showDebugInfo(`現在の単語帳の保存確認: ${Object.keys(parsedData[currentHash]).length}個の単語`);
    }
  } catch (error) {
    showDebugInfo(`保存確認エラー: ${error.message}`);
  }
  
  // 単語帳個別JSONファイルへの保存（非同期）
  saveProgressToWordbookFile().catch(error => {
    showDebugInfo(`単語帳個別保存エラー: ${error.message}`);
  });
  
  showDebugInfo(`進捗データを保存: 単語帳数=${Object.keys(allProgress).length}, 現在の単語帳=${currentHash}, 単語数=${Object.keys(progressData).length}`);
  
  // XPを更新
  calculateAndUpdateXP();
}

function updateProgressBar() {
  // 一回のセッションで実行する予定の単語数（新出 + 復習）
  const totalPlanned = newWordCount + reviewWordCount;
  
  // 進捗率を計算（正解数 / 予定数）
  const percent = totalPlanned > 0 ? Math.round((correctCount / totalPlanned) * 100) : 0;
  document.getElementById("progressFill").style.width = percent + "%";

  // 残り問題数（予定数 - 進捗）
  const remaining = totalPlanned - correctCount;
  
  // これから出る予定の問題数を計算
  const remainingInQueue = quizQueue.slice(currentIndex + 1); // 現在の問題を除く残り
  
  // 新出・復習・古い問題の予定数を計算（間違えた単語は除外）
  const newPlanned = remainingInQueue.filter(w => !progressData[w.question] && !wrongList.includes(w)).length;
  const reviewPlanned = remainingInQueue.filter(w => {
    const progress = progressData[w.question];
    if (!progress || !progress.history || progress.history.length === 0) return false;
    
    // 一か月以上前の学習履歴があるかチェック
    const now = Date.now();
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
    const latestHistory = progress.history[progress.history.length - 1];
    const isOld = latestHistory.timestamp < oneMonthAgo;
    
    return progressData[w.question] && !wrongList.includes(w) && !isOld;
  }).length;
  
  const oldPlanned = remainingInQueue.filter(w => {
    const progress = progressData[w.question];
    if (!progress || !progress.history || progress.history.length === 0) return false;
    
    // 一か月以上前の学習履歴があるかチェック
    const now = Date.now();
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
    const latestHistory = progress.history[progress.history.length - 1];
    const isOld = latestHistory.timestamp < oneMonthAgo;
    
    return progressData[w.question] && !wrongList.includes(w) && isOld;
  }).length;
  
  // 間違いカウント（一つの問題につき一回のみ、正解した場合はカウントから引く）
  // 現在間違いリストにある単語数（正解したものは除外される）
  const wrongCount = wrongList.length;

  document.getElementById("statusText").textContent =
    `進捗: ${correctCount}/${totalPlanned} | 残り: ${remaining}（新出: ${newPlanned} / 復習: ${reviewPlanned} / 古い: ${oldPlanned} / 間違い: ${wrongCount}）`;
    
  // デバッグ情報を追加
  showDebugInfo(`進捗更新: 正解${correctCount}/${totalPlanned}, 残り${remaining}, 新出予定${newPlanned}, 復習予定${reviewPlanned}, 古い問題予定${oldPlanned}, 間違い${wrongCount}`);
  showDebugInfo(`予定数: 新出${newWordCount}, 復習${reviewWordCount}, 合計${totalPlanned}`);
}

function toggleMemo() {
  const memo = document.getElementById("memoSection");
  const btn = document.getElementById("memoToggleBtn");

  if (memo.style.display === "none") {
    memo.style.display = "block";
    btn.textContent = "メモを閉じる";
    loadMemo(currentWord.question);
  } else {
    memo.style.display = "none";
    btn.textContent = "メモを見る";
  }
}

function loadMemo(word) {
  const memo = progressData[word]?.memo || "";
  document.getElementById("wordMemo").value = memo;
}

function saveMemo() {
  if (!currentWord) return;
  
  const word = currentWord.question;
  if (!progressData[word]) {
    progressData[word] = { correct: 0, wrong: 0 };
  }
  progressData[word].memo = document.getElementById("wordMemo").value;
  saveProgress();
  
  // 保存完了のフィードバック
  const saveBtn = document.getElementById("saveMemoBtn");
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "保存完了！";
  setTimeout(() => {
    saveBtn.textContent = originalText;
  }, 1000);
}

// グローバルな設定関数は削除

function shuffle(arr) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

function showDebugInfo(message) {
  // デバッグモードでなくてもdebug.jsonに保存
  saveDebugToJson(message);
  
  // コンソールログは常に出力
  console.log(message);
  
  // デバッグモードの場合のみUIに表示
  if (!debugMode) return;
  const debugInfo = document.getElementById("debugInfo");
  const debugContent = document.getElementById("debugContent");
  
  if (debugInfo && debugContent) {
    debugInfo.style.display = "block";
    const timestamp = new Date().toLocaleTimeString();
    debugContent.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    
    // 設定された件数のみ表示（debugInfoMaxCount）
    const lines = debugContent.children;
    if (lines.length > debugInfoMaxCount) {
      // 古いログから削除
      while (lines.length > debugInfoMaxCount) {
        debugContent.removeChild(lines[0]);
      }
    }
  }
}

// debug.jsonにデバッグ情報を保存する関数
function saveDebugToJson(message) {
  try {
    // 日本標準時（JST）でタイムスタンプを生成
    const now = new Date();
    const jstOffset = 9 * 60; // JSTはUTC+9
    const jstTime = new Date(now.getTime() + (jstOffset * 60 * 1000));
    const timestamp = jstTime.toISOString().replace('Z', '+09:00');
    
    const debugEntry = {
      timestamp: timestamp,
      message: message,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    // 既存のdebug.jsonを読み込み
    let debugData = { logs: [] };
    try {
      const existingData = localStorage.getItem('debugData');
      if (existingData && existingData.trim().length > 0) {
        try {
          debugData = JSON.parse(existingData);
          // データ構造の検証
          if (!debugData || typeof debugData !== 'object') {
            debugData = { logs: [] };
          }
          if (!debugData.logs || !Array.isArray(debugData.logs)) {
            debugData.logs = [];
          }
        } catch (parseError) {
          console.error('debugDataのJSON解析エラー:', parseError);
          debugData = { logs: [] };
        }
      }
    } catch (e) {
      // 既存データの読み込みに失敗した場合は新しいデータを作成
      debugData = { logs: [] };
    }
    
    // 新しいログエントリを追加
    debugData.logs.push(debugEntry);
    
    // ログの最大数を制限（最新1000件）
    if (debugData.logs.length > 1000) {
      debugData.logs = debugData.logs.slice(-1000);
    }
    
    // localStorageに保存
    try {
      localStorage.setItem('debugData', JSON.stringify(debugData));
    } catch (storageError) {
      console.error('localStorage保存エラー:', storageError);
      // localStorageが満杯の場合は古いログを削除して再試行
      if (debugData.logs.length > 100) {
        debugData.logs = debugData.logs.slice(-100);
        try {
          localStorage.setItem('debugData', JSON.stringify(debugData));
        } catch (retryError) {
          console.error('localStorage再試行エラー:', retryError);
        }
      }
    }
    
    // debug.jsonファイルとしてダウンロード可能にする
    try {
      const debugJson = JSON.stringify(debugData, null, 2);
      const blob = new Blob([debugJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // 既存のダウンロードリンクを更新
      let debugLink = document.getElementById('debugDownloadLink');
      if (!debugLink) {
        debugLink = document.createElement('a');
        debugLink.id = 'debugDownloadLink';
        debugLink.style.display = 'none';
        document.body.appendChild(debugLink);
      }
      
      debugLink.href = url;
      debugLink.download = 'debug.json';
    } catch (blobError) {
      console.error('debug.jsonファイル生成エラー:', blobError);
    }
    
    // 自動保存の条件チェック
    const currentTime = Date.now();
    const timeSinceLastSave = currentTime - lastDebugSaveTime;
    const newLogCount = debugData.logs.length - lastDebugLogCount;
    
    // 保存条件:
    // 1. 100件ごと
    // 2. 最後の保存から5分以上経過 かつ 新しいログがある
    const shouldSave100 = debugData.logs.length % 100 === 0;
    const shouldSave5min = timeSinceLastSave >= 5 * 60 * 1000 && newLogCount > 0;
    
    if (shouldSave100) {
      console.log(`[saveDebugToJson] 100件到達: debug.json自動保存を実行`);
      autoSaveDebugJson(debugData);
    } else if (shouldSave5min) {
      console.log(`[saveDebugToJson] 5分経過 & 新規ログあり: debug.json自動保存を実行`);
      autoSaveDebugJson(debugData);
    }
    
    // 定期的に保存状況をログ出力（10件ごと）
    if (debugData.logs.length % 10 === 0) {
      console.log(`[saveDebugToJson] ログ数: ${debugData.logs.length}件, ファイルハンドル: ${fileHandles.debug ? '設定済み' : '未設定'}`);
      if (!fileHandles.debug) {
        console.log(`[saveDebugToJson] ヒント: 「⚙️ 設定」→「📁 ファイルハンドルを設定」で自動保存を有効化できます`);
      }
    }
    
  } catch (error) {
    console.error('debug.json保存エラー:', error);
    // エラーが発生してもアプリケーションの動作を停止させない
  }
}

// debug.jsonを自動保存する関数
async function autoSaveDebugJson(debugData) {
  try {
    let fileHandle = fileHandles.debug;
    
    // ファイルハンドルがない場合は取得を試みる
    if (!fileHandle) {
      // File System Access APIのサポート確認
      if (!window.showSaveFilePicker) {
        console.log(`[autoSaveDebugJson] File System Access APIがサポートされていません`);
        return;
      }
      
      // 100件以上貯まっている場合のみ処理を続行
      if (debugData.logs.length < 100) {
        return;
      }
      
      console.log(`[autoSaveDebugJson] debug.jsonのファイルハンドルが未設定です`);
      
      // file://プロトコルの場合は、ファイルハンドルの設定を促す
      if (window.location.protocol === 'file:') {
        console.log(`[autoSaveDebugJson] file://プロトコル: setupAllFileHandles()での設定を推奨`);
        console.log(`[autoSaveDebugJson] ヒント: 「⚙️ 設定」→「📁 ファイルハンドルを設定」で設定してください`);
        return;
      }
      
      try {
        // ファイルハンドルを取得
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'debug.json',
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }]
        });
        
        // ファイルハンドルを保存
        fileHandles.debug = fileHandle;
        console.log(`[autoSaveDebugJson] debug.jsonファイルハンドルを取得: ${fileHandle.name}`);
      } catch (pickerError) {
        if (pickerError.name === 'AbortError') {
          console.log(`[autoSaveDebugJson] ファイル選択がキャンセルされました`);
        }
        return;
      }
    }
    
    // ファイルに書き込み
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(debugData, null, 2));
    await writable.close();
    
    // 保存時刻とログ数を更新
    lastDebugSaveTime = Date.now();
    lastDebugLogCount = debugData.logs.length;
    
    console.log(`[autoSaveDebugJson] debug.jsonに自動保存しました: ${debugData.logs.length}件`);
  } catch (error) {
    console.error('debug.json自動保存エラー:', error);
    // ファイルハンドルをクリア
    fileHandles.debug = null;
  }
}

// 既存のdebug.jsonファイルを読み込んで内容をマージする関数
async function loadExistingDebugJson() {
  try {
    // File System Access APIのサポート確認
    if (!window.showOpenFilePicker) {
      showDebugInfo(`File System Access APIがサポートされていないため、既存のdebug.jsonファイルの読み込みをスキップします`);
      return;
    }
    
    // HTTPプロトコルの場合のみfetchを試行
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
      showDebugInfo(`file://プロトコル: 既存のdebug.jsonファイルの読み込みをスキップ（File System Access API使用）`);
      return;
    }
    
    try {
      showDebugInfo(`既存のdebug.jsonファイルを読み込み中...`);
      const response = await fetch('./debug.json');
      
      if (response.ok) {
        const content = await response.text();
        
        // 空のファイルの場合は新しいデータ構造を作成
        if (!content || content.trim().length === 0) {
          showDebugInfo(`debug.jsonが空です: 新しいデータ構造を作成します`);
          localStorage.setItem('debugData', JSON.stringify({ logs: [] }));
          return;
        }
        
        showDebugInfo(`既存のdebug.jsonファイルを発見: ${content.length}文字`);
        
        let existingDebugData = { logs: [] };
        try {
          existingDebugData = JSON.parse(content);
        } catch (parseError) {
          showDebugInfo(`debug.jsonのJSON解析エラー: ${parseError.message}`);
          showDebugInfo(`新しいデータ構造を作成します`);
          existingDebugData = { logs: [] };
        }
        
        // データ構造の検証
        if (!existingDebugData.logs || !Array.isArray(existingDebugData.logs)) {
          showDebugInfo(`debug.jsonの構造が無効です: 新しい構造を作成`);
          existingDebugData = { logs: [] };
        }
        
        showDebugInfo(`既存のdebug.jsonから${existingDebugData.logs.length}件のログを読み込みました`);
        
        // localStorageの既存データとマージ
        let currentDebugData = { logs: [] };
        try {
          const currentData = localStorage.getItem('debugData');
          if (currentData) {
            currentDebugData = JSON.parse(currentData);
            if (!currentDebugData.logs || !Array.isArray(currentDebugData.logs)) {
              currentDebugData = { logs: [] };
            }
          }
        } catch (e) {
          // 既存データの読み込みに失敗した場合は新しいデータを作成
          currentDebugData = { logs: [] };
        }
        
        // 既存のdebug.jsonのログを現在のデータに追加
        const mergedLogs = [...existingDebugData.logs, ...currentDebugData.logs];
        
        // 重複を除去（同じtimestampとmessageの組み合わせ）
        const uniqueLogs = mergedLogs.filter((log, index, self) => 
          index === self.findIndex(l => l.timestamp === log.timestamp && l.message === log.message)
        );
        
        // タイムスタンプでソート
        uniqueLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // ログの最大数を制限（最新1000件）
        const finalLogs = uniqueLogs.length > 1000 ? uniqueLogs.slice(-1000) : uniqueLogs;
        
        const mergedDebugData = { logs: finalLogs };
        
        // localStorageに保存
        localStorage.setItem('debugData', JSON.stringify(mergedDebugData));
        showDebugInfo(`既存のdebug.jsonと現在のデータをマージしました: ${finalLogs.length}件のログ`);
        
      } else {
        showDebugInfo(`既存のdebug.jsonファイルが見つかりません: ${response.status}`);
        // 新しいデータ構造を作成
        localStorage.setItem('debugData', JSON.stringify({ logs: [] }));
      }
    } catch (fetchError) {
      showDebugInfo(`既存のdebug.jsonファイルの読み込みエラー: ${fetchError.message}`);
      // 新しいデータ構造を作成
      localStorage.setItem('debugData', JSON.stringify({ logs: [] }));
    }
    
  } catch (error) {
    showDebugInfo(`既存のdebug.jsonファイル読み込み処理エラー: ${error.message}`);
    // エラーが発生してもアプリケーションの動作を停止させない
  }
}

// 学習データ削除
async function deleteProgress() {
  const choice = confirm("どの学習データを消去しますか？\n「OK」: この単語帳のみ\n「キャンセル」: 全ての単語帳");
  
  if (choice) {
    // この単語帳の進捗のみ削除
    const currentHash = getCurrentWordbookHash();
    if (currentHash) {
      let allProgress = JSON.parse(localStorage.getItem("allProgressData") || "{}");
      delete allProgress[currentHash];
      localStorage.setItem("allProgressData", JSON.stringify(allProgress));
      progressData = {};
      alert("この単語帳の学習データを消去しました");
    } else {
      alert("現在学習中の単語帳がありません。");
      return;
    }
  } else {
    // 全ての進捗を削除
    if (!confirm("本当によろしいですか？全ての単語帳の学習データが消去されます。")) return;
    localStorage.removeItem("allProgressData");
    progressData = {};
    alert("全ての学習データを消去しました");
  }

  // 進捗リセット
  correctCount = 0;
  if (allWords.length > 0) {
    prepareQuiz();
  } else {
    updateInitialDisplay();
    await showMenuScreen(); // メニューに戻る
  }
}

// 連続ログイン記録管理
function checkAndUpdateLoginStreak() {
  // 日本標準時（JST）で日付を取得
  const now = new Date();
  const jstOffset = 9 * 60; // JSTはUTC+9
  const jstTime = new Date(now.getTime() + (jstOffset * 60 * 1000));
  const todayStr = jstTime.toISOString().slice(0, 10);
  
  let streak = parseInt(localStorage.getItem('loginStreak') || '0', 10);
  let lastDate = localStorage.getItem('lastLoginDate');

  // data.jsonから最後の実行日を取得
  let lastSessionDate = null;
  try {
    const dataJsonData = localStorage.getItem('dataJson');
    if (dataJsonData) {
      const parsedData = JSON.parse(dataJsonData);
      if (parsedData.sessions && parsedData.sessions.length > 0) {
        // 最新のセッション記録から日付を取得
        const latestSession = parsedData.sessions[0];
        if (latestSession.length >= 8) {
          const timestamp = latestSession[0];
          const dateParts = timestamp.split('.');
          if (dateParts.length === 6) {
            const [year, month, day] = dateParts.map(Number);
            lastSessionDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            showDebugInfo(`data.jsonから最後の実行日を取得: ${lastSessionDate}`);
          }
        }
      }
    }
  } catch (e) {
    showDebugInfo(`data.jsonから実行日取得エラー: ${e.message}`);
  }
  
  // data.jsonの日付とlastLoginDateを比較して、より新しい方を使用
  if (lastSessionDate && (!lastDate || lastSessionDate > lastDate)) {
    lastDate = lastSessionDate;
    showDebugInfo(`data.jsonの日付を使用: ${lastDate}`);
  }

  if (!lastDate) {
    // 初回
    localStorage.setItem('loginStreak', '0');
    localStorage.setItem('lastLoginDate', '');
    showDebugInfo(`初回起動: 連続記録を0に設定`);
    updateStreakDisplay();
    return;
  }
  
  // プログラム起動時は連続記録のチェックのみ行い、lastLoginDateは更新しない
  showDebugInfo(`起動時: 連続記録=${streak}日, 前回学習日=${lastDate}`);
  
  if (lastDate) {
  const last = new Date(lastDate);
    const today = new Date(todayStr);
  const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    
    showDebugInfo(`日数差を計算: 今日=${todayStr}, 前回=${lastDate}, 差=${diffDays}日`);
    
  if (diffDays >= 2) {
    streak = 0;
      localStorage.setItem('loginStreak', streak.toString());
      showDebugInfo(`2日以上空いたため連続記録をリセット: ${streak}日`);
  } else if (diffDays === 1) {
      // 1日空いた場合は連続記録を維持（減算しない）
      showDebugInfo(`1日空き: 連続記録を維持: ${streak}日`);
    } else if (diffDays === 0) {
      showDebugInfo(`今日既に学習済み: 連続記録を維持: ${streak}日`);
    }
  }
  
  // 連続記録表示を更新（起動時のみ）
  updateStreakDisplay();
}

function updateLoginStreakOnClear() {
  // 一周終わったときに呼ぶ
  // 日本標準時（JST）で日付を取得
  const now = new Date();
  const jstOffset = 9 * 60; // JSTはUTC+9
  const jstTime = new Date(now.getTime() + (jstOffset * 60 * 1000));
  const todayStr = jstTime.toISOString().slice(0, 10);
  
  let streak = parseInt(localStorage.getItem('loginStreak') || '0', 10);
  let lastDate = localStorage.getItem('lastLoginDate');
  
  showDebugInfo(`連続記録更新: 今日=${todayStr}, 前回=${lastDate}, 現在の連続記録=${streak}`);
  
  if (lastDate !== todayStr) {
    streak++;
    localStorage.setItem('loginStreak', streak.toString());
    localStorage.setItem('lastLoginDate', todayStr);
    showDebugInfo(`連続記録更新完了: ${streak}日`);
    
    // イラスト表示は初回のみ（Cookieで確認）
    const hasShownEffect = getCookie('shownRennzokuEffect') === 'true';
    if (!hasShownEffect) {
    playRennzokuEffect();
      setCookie('shownRennzokuEffect', 'true', 365); // 1年間有効
    }
  } else {
    showDebugInfo(`今日は既に学習済み: 連続記録は更新されません`);
  }
  
  // 連続記録表示を更新
  updateStreakDisplay();
}

// 連続記録表示を更新
function updateStreakDisplay() {
  const streak = parseInt(localStorage.getItem('loginStreak') || '0', 10);
  const streakCountElement = document.getElementById('streakCount');
  if (streakCountElement) {
    streakCountElement.textContent = streak;
    
    // 連続記録に応じてタイトルの色を変更
    const streakTitle = document.getElementById('streakTitle');
    if (streakTitle) {
      // 今日の日付を取得（JST）
      const now = new Date();
      const jstOffset = 9 * 60; // JSTはUTC+9
      const jstTime = new Date(now.getTime() + (jstOffset * 60 * 1000));
      const todayStr = jstTime.toISOString().slice(0, 10);
      const lastDate = localStorage.getItem('lastLoginDate');
      
      // 今日学習したかどうかをチェック
      const hasLearnedToday = lastDate === todayStr;
      
      if (streak >= 30) {
        if (hasLearnedToday) {
          streakTitle.style.color = '#FFD700'; // 金色
          streakTitle.innerHTML = `👑 連続学習: <span id="streakCount">${streak}</span>日`;
        } else {
          streakTitle.style.color = '#808080'; // 灰色
          streakTitle.innerHTML = `連続学習: <span id="streakCount">${streak}</span>日`;
        }
      } else if (streak >= 7) {
        if (hasLearnedToday) {
          streakTitle.style.color = '#FFA500'; // オレンジ
          streakTitle.innerHTML = `🔥 連続学習: <span id="streakCount">${streak}</span>日`;
        } else {
          streakTitle.style.color = '#808080'; // 灰色
          streakTitle.innerHTML = `連続学習: <span id="streakCount">${streak}</span>日`;
        }
      } else if (streak >= 3) {
        if (hasLearnedToday) {
          streakTitle.style.color = '#FF6347'; // トマト色
          streakTitle.innerHTML = `🔥 連続学習: <span id="streakCount">${streak}</span>日`;
        } else {
          streakTitle.style.color = '#808080'; // 灰色
          streakTitle.innerHTML = `連続学習: <span id="streakCount">${streak}</span>日`;
        }
      } else {
        if (hasLearnedToday) {
          streakTitle.style.color = 'white';
          streakTitle.innerHTML = `🔥 連続学習: <span id="streakCount">${streak}</span>日`;
        } else {
          streakTitle.style.color = '#808080'; // 灰色
          streakTitle.innerHTML = `連続学習: <span id="streakCount">${streak}</span>日`;
        }
      }
      
      // デバッグ情報を出力
      showDebugInfo(`連続記録表示更新: ${streak}日, 今日学習済み: ${hasLearnedToday}, 前回学習日: ${lastDate}`);
    }
  }
}

// rennzoku/taikiのファイル名リスト（例: rennzoku1.gif, rennzoku2.gif...）
const RENNZOKU_GIFS = ['1.gif', '2.gif', '3.gif']; // 実際のファイル名に合わせて編集
const RENNZOKU_MP3 = 'rennzoku.mp3';

function playRennzokuEffect() {
  // イラストファイルの存在確認
  const testImage = new Image();
  const gifName = RENNZOKU_GIFS[0]; // 最初のファイルでテスト
  const gifPath = `rennzoku/${gifName}`;
  
  testImage.onload = function() {
    // イラストが存在する場合のみ表示
    showRennzokuEffect();
  };
  
  testImage.onerror = function() {
    // イラストが存在しない場合は何もしない
    showDebugInfo('イラストファイルが存在しないため、演出をスキップします');
  };
  
  testImage.src = gifPath;
}

function showRennzokuEffect() {
  // ランダムなファイル名を選ぶ
  const idx = Math.floor(Math.random() * RENNZOKU_GIFS.length);
  const gifName = RENNZOKU_GIFS[idx];
  const gifPath = `rennzoku/${gifName}`;
  const mp3Path = `rennzoku/rennzoku.mp3`;
  const taikiGifPath = `taiki/${gifName}`;

  // 既存の演出を消す
  removeRennzokuEffect();

  // gif/mp3を再生
  const effectDiv = document.createElement('div');
  effectDiv.id = 'rennzokuEffectDiv';
  effectDiv.style.position = 'fixed';
  effectDiv.style.left = '0';
  effectDiv.style.top = '0';
  effectDiv.style.width = '100vw';
  effectDiv.style.height = '100vh';
  effectDiv.style.background = 'rgba(0,0,0,0.5)';
  effectDiv.style.display = 'flex';
  effectDiv.style.justifyContent = 'center';
  effectDiv.style.alignItems = 'center';
  effectDiv.style.zIndex = '9999';

  const gif = document.createElement('img');
  gif.src = gifPath;
  gif.style.maxWidth = '60vw';
  gif.style.maxHeight = '60vh';
  gif.style.borderRadius = '10px';
  effectDiv.appendChild(gif);

  const audio = document.createElement('audio');
  audio.src = mp3Path;
  audio.autoplay = true;
  audio.onended = function() {
    // 1回再生後、taikiのgifに切り替え
    gif.src = taikiGifPath;
    // ループ再生風に（gifは自動ループ）
  };
  effectDiv.appendChild(audio);

  document.body.appendChild(effectDiv);

  // ファイル再読込や離脱時に消す
  window.addEventListener('beforeunload', removeRennzokuEffect);
}

function removeRennzokuEffect() {
  const div = document.getElementById('rennzokuEffectDiv');
  if (div) div.remove();
  window.removeEventListener('beforeunload', removeRennzokuEffect);
}

// Cookie関連の関数
function setCookie(name, value, days) {
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// キーボードショートカット
window.addEventListener('keydown', function(e) {
  // 入力欄やtextareaにフォーカスがある場合は無視
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  
  // バックスラッシュキーで統計確認（デバッグモードでのみ）
  if (e.key === '\\' || e.key === '¥') {
    if (debugMode) {
      showStatsStatus();
      e.preventDefault();
      return;
    } else {
      // デバッグモードがOFFの場合は何もしない
      return;
    }
  }
  
  // スペースキーで答えを見る
  if (e.code === 'Space' || e.key === ' ') {
    const showBtn = document.getElementById('showAnswerBtn');
    if (showBtn && showBtn.style.display !== 'none' && !showBtn.disabled) {
      showAnswer();
      e.preventDefault();
    }
  }
  
  // 1,2,3,4キーで難易度評価
  if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
    const gradeButtons = document.getElementById('gradeButtons');
    if (gradeButtons && gradeButtons.style.display !== 'none') {
      const buttonIndex = parseInt(e.key) - 1;
      const buttons = gradeButtons.querySelectorAll('button');
      if (buttons[buttonIndex]) {
        showDebugInfo(`数字キー${e.key}が押されました: ボタン${buttonIndex + 1}をクリック`);
        buttons[buttonIndex].click();
        e.preventDefault();
      } else {
        showDebugInfo(`数字キー${e.key}が押されましたが、ボタン${buttonIndex + 1}が見つかりません`);
      }
    } else {
      showDebugInfo(`数字キー${e.key}が押されましたが、gradeButtonsが表示されていません`);
    }
  }
});

// 履歴管理
async function getHistoryList() {
  const progressData = await loadProgressData(true);
  return progressData.wordbookHistory || [];
}

async function setHistoryList(list) {
  const progressData = await loadProgressData(true);
  progressData.wordbookHistory = list;
  await saveProgressData(progressData);
}

async function addHistoryEntry(name, content) {
  const hash = hashString(content);
  let list = await getHistoryList();
  
  // 既存なら何もしない
  const existing = list.find(e => e.hash === hash);
  if (existing) {
    showDebugInfo(`既存の単語帳: ${name}`);
    return;
  }
  
  list.unshift({ 
    title: name.replace('.csv', ''), 
    hash, 
    content,
    settings: { // デフォルト設定（全体設定から取得）
      newCount: defaultNewWordCount,
      reviewCount: defaultReviewWordCount,
      fontSize: defaultQuestionFontSize
    }
  });
  
  // 10件まで
  if (list.length > 10) list = list.slice(0, 10);
  
  await setHistoryList(list);
  showDebugInfo(`履歴に追加: ${name} (hash: ${hash})`);
  showDebugInfo(`初期設定: 新出${defaultNewWordCount}, 復習${defaultReviewWordCount}, フォント${defaultQuestionFontSize}px`);
}
function hashString(str) {
  // 簡易ハッシュ
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

function getCurrentWordbookHash() {
  if (!allWords || allWords.length === 0) return null;
  return hashString(allWords.map(w => w.question + w.answer).join(''));
}

async function showMenuScreen() {
  document.getElementById('menuScreen').style.display = 'block';
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('bottomBar').style.display = 'none';
  document.getElementById('memoSection').style.display = 'none';
  document.getElementById('progressBar').style.display = 'none';
  document.getElementById('statusText').style.display = 'none';
  document.getElementById('backToMenuBtn').style.display = 'none'; // 追加

  // 連続記録表示を表示
  const streakDisplay = document.getElementById('streakDisplay');
  if (streakDisplay) streakDisplay.style.display = 'block';

  // 履歴リスト表示
  const list = await getHistoryList();
  const historyDiv = document.getElementById('historyList');
  historyDiv.innerHTML = '';
  
  // 単語帳が一つもない場合は、同じフォルダ内のCSVファイルを自動読み込み
  if (list.length === 0) {
    showDebugInfo('単語帳の履歴がありません: 同じフォルダ内のCSVファイルを自動検出します');
    
    // CSVファイルの自動検出を試行
    await autoLoadCsvFilesFromFolder();
    
    // 再度履歴を取得
    const updatedList = await getHistoryList();
    if (updatedList.length === 0) {
      // それでも履歴がない場合
      historyDiv.innerHTML = '<div>履歴はありません</div>';
    } else {
      // 自動読み込み後に履歴を表示
      showDebugInfo(`自動読み込み完了: ${updatedList.length}件の単語帳を追加しました`);
      // 履歴リストを再描画するため、関数を再帰呼び出し
      await showMenuScreen();
      return;
    }
  } else {
    list.forEach(entry => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'history-entry';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'history-title';
      titleSpan.textContent = entry.title || entry.name;
      entryDiv.appendChild(titleSpan);

      const settingsBtn = document.createElement('button');
      settingsBtn.textContent = '⚙️';
      settingsBtn.className = 'history-settings-btn';
      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        openSettingsPopup(entry.hash);
      };
      entryDiv.appendChild(settingsBtn);

      const statsBtn = document.createElement('button');
      statsBtn.textContent = '📊';
      statsBtn.className = 'history-stats-btn';
      statsBtn.onclick = (e) => {
        e.stopPropagation();
        openStatsPopup(entry.hash);
      };
      entryDiv.appendChild(statsBtn);

      const startBtn = document.createElement('button');
      startBtn.textContent = `開始`;
      startBtn.className = 'history-start-btn';
      startBtn.onclick = (e) => {
        e.stopPropagation();
        loadWordbookFromHistory(entry);
      };
      entryDiv.appendChild(startBtn);

      // 単語帳名のクリックイベント（単語帳名をクリックした時に開始）
      titleSpan.onclick = (e) => {
        e.stopPropagation();
        loadWordbookFromHistory(entry);
      };
      
      // 履歴エントリ全体のクリックイベントは削除（単語帳名と開始ボタン以外では開始しない）

      historyDiv.appendChild(entryDiv);
    });
  }
  // 右下の新規ボタン・右上ファイル選択・全体統計ボタンを表示
  const newBtn = document.getElementById('floatingNewBtn');
  if (newBtn) newBtn.style.display = '';
  const fileInputLabel = document.getElementById('fileInputLabel');
  if (fileInputLabel) fileInputLabel.style.display = '';
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.style.display = 'none'; // input自体はhiddenのまま
  const globalStatsBtn = document.getElementById('globalStatsBtn');
  if (globalStatsBtn) globalStatsBtn.style.display = '';
}

function hideMenuScreen() {
  document.getElementById('menuScreen').style.display = 'none';
  document.getElementById('mainContent').style.display = '';
  document.getElementById('bottomBar').style.display = '';
  document.getElementById('progressBar').style.display = 'block';
  document.getElementById('statusText').style.display = 'block';
  document.getElementById('backToMenuBtn').style.display = ''; // 追加
  
  // 連続記録表示を非表示
  const streakDisplay = document.getElementById('streakDisplay');
  if (streakDisplay) streakDisplay.style.display = 'none';
  
  // 右下の新規ボタン・右上ファイル選択・全体統計ボタンを非表示
  const newBtn = document.getElementById('floatingNewBtn');
  if (newBtn) newBtn.style.display = 'none';
  const fileInputLabel = document.getElementById('fileInputLabel');
  if (fileInputLabel) fileInputLabel.style.display = 'none';
  const globalStatsBtn = document.getElementById('globalStatsBtn');
  if (globalStatsBtn) globalStatsBtn.style.display = 'none';
}
async function loadWordbookFromHistory(entry) {
  // ファイル内容を直接allWordsに流し込む
  const lines = entry.content.split("\n").map(line => line.trim()).filter(line => line);
  allWords = lines.map((line, index) => {
    const parts = line.split(",");
    const question = parts[0];
    const answer = parts[1];
    const reading = parts[2];
    if (!question || !answer) return null;
    return reading !== undefined
      ? { question: question.trim(), answer: answer.trim(), reading: reading.trim() }
      : { question: question.trim(), answer: answer.trim() };
  }).filter(word => word !== null);
  await loadProgress();
  prepareQuiz();
  hideMenuScreen();
}

function setupPopup() {
  const popup = document.getElementById('settingsPopup');
  const closeBtn = document.getElementById('closePopupBtn');
  const saveBtn = document.getElementById('savePopupSettingsBtn');
  const deleteBtn = document.getElementById('popupDeleteProgressBtn');

  closeBtn.onclick = () => popup.style.display = 'none';
  saveBtn.onclick = savePopupSettings;
  
  // 学習データを消すボタンのイベントリスナー
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      showDeleteConfirmPopup();
    };
  }

  popup.onclick = (e) => {
    if (e.target === popup) {
      popup.style.display = 'none';
    }
  };
  
  // 削除確認ポップアップの設定
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const deleteConfirmPopup = document.getElementById('deleteConfirmPopup');
  
  if (confirmDeleteBtn) {
    confirmDeleteBtn.onclick = () => {
      deleteProgress();
      deleteConfirmPopup.style.display = 'none';
    };
  }
  
  if (cancelDeleteBtn) {
    cancelDeleteBtn.onclick = () => {
      deleteConfirmPopup.style.display = 'none';
    };
  }
  
  if (deleteConfirmPopup) {
    deleteConfirmPopup.onclick = (e) => {
      if (e.target === deleteConfirmPopup) {
        deleteConfirmPopup.style.display = 'none';
      }
    };
  }
  
  // 学習中断確認ポップアップの設定
  const continueLearningBtn = document.getElementById('continueLearningBtn');
  const quitLearningBtn = document.getElementById('quitLearningBtn');
  const quitConfirmPopup = document.getElementById('quitConfirmPopup');
  
  if (continueLearningBtn) {
    continueLearningBtn.onclick = () => {
      quitConfirmPopup.style.display = 'none';
    };
  }
  
  if (quitLearningBtn) {
    quitLearningBtn.onclick = () => {
      quitConfirmPopup.style.display = 'none';
      // 学習を終了してメニューに戻る
      quitLearning();
    };
  }
  
  if (quitConfirmPopup) {
    quitConfirmPopup.onclick = (e) => {
      if (e.target === quitConfirmPopup) {
        quitConfirmPopup.style.display = 'none';
      }
    };
  }
}

async function openSettingsPopup(hash) {
  showDebugInfo(`設定ポップアップを開きます: hash=${hash}`);
  
  // 履歴データの確認
  const history = await getHistoryList();
  showDebugInfo(`履歴データ数: ${history.length}`);
  showDebugInfo(`履歴データ: ${JSON.stringify(history.map(e => ({ hash: e.hash, title: e.title })))}`);
  
  const entry = history.find(e => e.hash === hash);
  if (!entry) {
    showDebugInfo(`エラー: hashに対応する履歴が見つかりません: ${hash}`);
    return;
  }

  showDebugInfo(`履歴エントリが見つかりました: ${entry.title}`);
  
  // 各要素の存在確認
  const settingsPopupHash = document.getElementById('settingsPopupHash');
  const popupTitle = document.getElementById('popupTitle');
  const popupNewCount = document.getElementById('popupNewCount');
  const popupReviewCount = document.getElementById('popupReviewCount');
  const popupQuestionFontSize = document.getElementById('popupQuestionFontSize');
  const settingsPopup = document.getElementById('settingsPopup');
  
  showDebugInfo(`要素の存在確認:`);
  showDebugInfo(`  settingsPopupHash: ${!!settingsPopupHash}`);
  showDebugInfo(`  popupTitle: ${!!popupTitle}`);
  showDebugInfo(`  popupNewCount: ${!!popupNewCount}`);
  showDebugInfo(`  popupReviewCount: ${!!popupReviewCount}`);
  showDebugInfo(`  popupQuestionFontSize: ${!!popupQuestionFontSize}`);
  showDebugInfo(`  settingsPopup: ${!!settingsPopup}`);
  
  if (!settingsPopup) {
    showDebugInfo(`エラー: settingsPopup要素が見つかりません`);
    return;
  }
  
  // 値の設定
  if (settingsPopupHash) settingsPopupHash.value = hash;
  if (popupTitle) popupTitle.value = entry.title || '';
  if (popupNewCount) popupNewCount.value = entry.settings?.newCount || 10;
  if (popupReviewCount) popupReviewCount.value = entry.settings?.reviewCount || 10;
  if (popupQuestionFontSize) popupQuestionFontSize.value = entry.settings?.fontSize || 32;
  
  showDebugInfo(`値の設定完了`);
  
  // ポップアップの表示
  settingsPopup.style.display = 'flex';
  showDebugInfo(`ポップアップの表示設定完了: display=${settingsPopup.style.display}`);
  
  // 表示状態の確認
  setTimeout(() => {
    const computedStyle = window.getComputedStyle(settingsPopup);
    showDebugInfo(`ポップアップの表示状態確認:`);
    showDebugInfo(`  display: ${computedStyle.display}`);
    showDebugInfo(`  visibility: ${computedStyle.visibility}`);
    showDebugInfo(`  opacity: ${computedStyle.opacity}`);
    showDebugInfo(`  z-index: ${computedStyle.zIndex}`);
    
    // ポップアップが表示されていない場合の対処
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
      showDebugInfo(`警告: ポップアップが表示されていません。強制的に表示を試行します。`);
      
      // 強制的に表示
      settingsPopup.style.display = 'flex';
      settingsPopup.style.visibility = 'visible';
      settingsPopup.style.opacity = '1';
      settingsPopup.style.zIndex = '1000';
      
      // 再度確認
      setTimeout(() => {
        const newComputedStyle = window.getComputedStyle(settingsPopup);
        showDebugInfo(`強制表示後の状態:`);
        showDebugInfo(`  display: ${newComputedStyle.display}`);
        showDebugInfo(`  visibility: ${newComputedStyle.visibility}`);
        showDebugInfo(`  opacity: ${newComputedStyle.opacity}`);
        showDebugInfo(`  z-index: ${newComputedStyle.zIndex}`);
      }, 100);
    }
  }, 100);
  
  // ポップアップの位置とサイズも確認
  showDebugInfo(`ポップアップの位置・サイズ確認:`);
  showDebugInfo(`  offsetWidth: ${settingsPopup.offsetWidth}`);
  showDebugInfo(`  offsetHeight: ${settingsPopup.offsetHeight}`);
  showDebugInfo(`  offsetLeft: ${settingsPopup.offsetLeft}`);
  showDebugInfo(`  offsetTop: ${settingsPopup.offsetTop}`);
  
  // 緊急時の対処：ポップアップが表示されない場合の代替表示
  setTimeout(() => {
    const computedStyle = window.getComputedStyle(settingsPopup);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
      showDebugInfo(`緊急時: ポップアップが表示されません。コンソールに情報を表示します。`);
      
      console.log('=== 設定ポップアップ情報（緊急表示） ===');
      console.log(`単語帳: ${entry.title}`);
      console.log(`ハッシュ: ${hash}`);
      console.log(`設定:`, entry.settings || {});
      console.log('コンソールで以下のコマンドを実行してデバッグしてください:');
      console.log('- setDebugMode(true): デバッグモードを有効化');
      console.log('- 設定ボタンを再度クリック');
      console.log('- ブラウザの開発者ツールでエラーを確認');
    }
  }, 200);
}

async function savePopupSettings() {
  const hash = document.getElementById('settingsPopupHash').value;
  const title = document.getElementById('popupTitle').value;
  const newCount = parseInt(document.getElementById('popupNewCount').value);
  const reviewCount = parseInt(document.getElementById('popupReviewCount').value);
  const fontSize = parseInt(document.getElementById('popupQuestionFontSize').value);

  let history = await getHistoryList();
  const entryIndex = history.findIndex(e => e.hash === hash);
  if (entryIndex > -1) {
    history[entryIndex].title = title;
    history[entryIndex].settings = { newCount, reviewCount, fontSize };
    await setHistoryList(history);
  }

  document.getElementById('settingsPopup').style.display = 'none';
  await showMenuScreen(); // リストを再描画
}

async function openStatsPopup(hash) {
  // 統計表示前に強制的にデータを再読み込み
  showDebugInfo(`統計表示開始: hash=${hash}`);
  
  // 統計表示前に現在の進捗データを保存
  const currentHash = getCurrentWordbookHash();
  if (currentHash === hash && Object.keys(progressData).length > 0) {
    showDebugInfo(`統計表示前に進捗データを保存: ${Object.keys(progressData).length}個`);
    saveProgress();
    // 保存後に少し待ってからデータを取得
    setTimeout(async () => {
      await showStatsContent(hash);
    }, 100);
    return;
  }
  
  // 現在学習中でない場合は即座に表示
  await showStatsContent(hash);
}

async function showStatsContent(hash) {
  showDebugInfo(`=== 統計表示開始 ===`);
  showDebugInfo(`要求されたhash: ${hash}`);
  
  // 履歴・進捗データ取得
  const historyList = await getHistoryList();
  showDebugInfo(`履歴リスト数: ${historyList.length}`);
  
  const entry = historyList.find(e => e.hash === hash);
  if (!entry) {
    showDebugInfo(`エラー: 履歴エントリが見つかりません: ${hash}`);
    alert(`履歴エントリが見つかりません: ${hash}`);
    return;
  }
  
  showDebugInfo(`履歴エントリ発見: ${entry.title}`);
  
  // localStorageから確実にデータを取得
  let allProgress = {};
  try {
    const storedData = localStorage.getItem("allProgressData");
    if (storedData) {
      allProgress = JSON.parse(storedData);
      showDebugInfo(`localStorageから正常にデータ取得: ${Object.keys(allProgress).length}個の単語帳`);
      showDebugInfo(`localStorageのキー: ${Object.keys(allProgress).join(', ')}`);
    } else {
      showDebugInfo("localStorageにallProgressDataが存在しません");
    }
  } catch (error) {
    showDebugInfo(`localStorage読み込みエラー: ${error.message}`);
    allProgress = {};
  }
  
  showDebugInfo(`localStorageから取得したallProgress: ${Object.keys(allProgress).length}個の単語帳`);
  
  // 現在学習中の単語帳の場合、progressDataも参照
  const currentHash = getCurrentWordbookHash();
  showDebugInfo(`現在の単語帳hash: ${currentHash}`);
  showDebugInfo(`現在のprogressData: ${Object.keys(progressData).length}個の単語`);
  
  if (currentHash === hash && Object.keys(progressData).length > 0) {
    showDebugInfo(`現在の進捗データを使用: ${Object.keys(progressData).length}個`);
    // 既存のデータと現在のデータをマージ
    allProgress[hash] = { ...allProgress[hash], ...progressData };
    showDebugInfo(`マージ後のallProgress[${hash}]: ${Object.keys(allProgress[hash]).length}個の単語`);
  }
  
  let progress = allProgress[hash] || {};
  
  // 進捗データの詳細をログ出力
  showDebugInfo(`単語帳 ${hash} の進捗データ詳細:`);
  if (Object.keys(progress).length === 0) {
    showDebugInfo(`  進捗データが空です`);
    showDebugInfo(`  考えられる原因:`);
    showDebugInfo(`    1. まだ学習していない`);
    showDebugInfo(`    2. データが保存されていない`);
    showDebugInfo(`    3. hashが一致していない`);
  } else {
    Object.entries(progress).forEach(([word, p]) => {
      showDebugInfo(`  ${word}:`);
      showDebugInfo(`    correct: ${p.correct || 0}`);
      showDebugInfo(`    wrong: ${p.wrong || 0}`);
      showDebugInfo(`    history: ${p.history ? p.history.length : 0}件`);
      if (p.history && p.history.length > 0) {
        const correctCount = p.history.filter(h => h.grade === 'easy' || h.grade === 'normal').length;
        const wrongCount = p.history.filter(h => h.grade === 'again' || h.grade === 'hard').length;
        showDebugInfo(`    履歴から計算: 正解${correctCount}件, 間違い${wrongCount}件`);
      }
    });
  }

  // デバッグ情報
  showDebugInfo(`統計ポップアップ: hash=${hash}`);
  showDebugInfo(`履歴エントリ: ${entry.title}`);
  showDebugInfo(`進捗データ: ${Object.keys(progress).length}個の単語`);

  // 単語リスト
  const lines = entry.content.split("\n").map(line => line.trim()).filter(line => line);
  const words = lines.map(line => line.split(",")[0]);

  showDebugInfo(`単語数: ${words.length}`);

  // 進捗データがない場合のメッセージ
  if (Object.keys(progress).length === 0) {
    const noDataMessage = `
      <div style='text-align:center; padding:40px; color:#666;'>
        <h3>📊 学習データがありません</h3>
        <p>この単語帳はまだ学習されていません。</p>
        <p>学習を開始すると、ここに統計が表示されます。</p>
        <div style='margin-top:20px; padding:15px; background:#f8f9fa; border-radius:8px;'>
          <strong>単語帳情報:</strong><br>
          タイトル: ${entry.title || entry.name}<br>
          単語数: ${words.length}個${debugMode ? `<br>ハッシュ: ${hash}` : ''}
        </div>
      </div>
    `;
    
    document.getElementById('statsContent').innerHTML = noDataMessage;
    
    // 統計ポップアップを表示
    const statsPopup = document.getElementById('statsPopup');
    if (statsPopup) {
      statsPopup.style.display = 'flex';
      showDebugInfo('統計ポップアップを表示しました（データなし）');
    } else {
      showDebugInfo('エラー: statsPopup要素が見つかりません');
    }
    
    // 統計読み込み完了メッセージを右下に表示
    showStatsCompleteMessage(entry.title || entry.name);
    return;
  }

  // 単語ごとの習得状況
  let tableHtml = `<table class='stats-table'><tr><th>単語</th><th>正解数</th><th>間違い数</th><th>最終評価</th><th>学習回数</th></tr>`;
  
  // 統計サマリー用の変数
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalHistory = 0;
  
  words.forEach(word => {
    const p = progress[word] || { correct: 0, wrong: 0, history: [] };
    const last = p.history && p.history.length > 0 ? p.history[p.history.length-1].grade : "-";
    
    // 正解数・間違い数を履歴から正確に計算
    const correctCount = p.history ? p.history.filter(h => h.grade === 'easy' || h.grade === 'normal').length : 0;
    const wrongCount = p.history ? p.history.filter(h => h.grade === 'again' || h.grade === 'hard').length : 0;
    const historyCount = p.history ? p.history.length : 0;
    
    // 統計サマリーに加算
    totalCorrect += correctCount;
    totalWrong += wrongCount;
    totalHistory += historyCount;
    
    showDebugInfo(`単語: ${word}, 正解: ${correctCount}, 間違い: ${wrongCount}, 履歴: ${p.history ? p.history.length : 0}`);
    tableHtml += `<tr><td>${word}</td><td>${correctCount}</td><td>${wrongCount}</td><td>${last}</td><td>${p.history ? p.history.length : 0}</td></tr>`;
  });
  
  // 統計サマリー行を追加
  tableHtml += `<tr style="background-color:#f0f0f0;font-weight:bold;"><td>合計</td><td>${totalCorrect}</td><td>${totalWrong}</td><td>-</td><td>${totalHistory}</td></tr>`;
  tableHtml += `</table>`;

  // 学習履歴（直近20件）
  let historyRows = [];
  Object.entries(progress).forEach(([word, p]) => {
    if (p.history) {
      p.history.forEach(h => {
        historyRows.push({ word, ...h });
      });
    }
  });
  historyRows.sort((a, b) => b.timestamp - a.timestamp);
  showDebugInfo(`学習履歴: ${historyRows.length}件`);
  
  // 履歴データの詳細をログ出力
  if (historyRows.length > 0) {
    showDebugInfo(`履歴データの最初の5件:`);
    historyRows.slice(0, 5).forEach((h, index) => {
      const date = new Date(h.timestamp).toLocaleString();
      showDebugInfo(`  ${index + 1}. ${h.word} - ${h.grade} (${date})`);
    });
  } else {
    showDebugInfo(`履歴データがありません。progress: ${Object.keys(progress).length}個の単語`);
    Object.entries(progress).forEach(([word, p]) => {
      showDebugInfo(`  ${word}: history=${p.history ? p.history.length : 'undefined'}`);
    });
  }
  
  let historyHtml = `<h4>直近の学習履歴</h4><table class='stats-table'><tr><th>日時</th><th>単語</th><th>評価</th></tr>`;
  historyRows.slice(0, 20).forEach(h => {
    const date = new Date(h.timestamp).toLocaleString();
    historyHtml += `<tr><td>${date}</td><td>${h.word}</td><td>${h.grade}</td></tr>`;
  });
  historyHtml += `</table>`;

  // 学習セッション時間
  let sessionHtml = '';
  if (entry.sessionStartTime && entry.sessionEndTime) {
    const min = Math.round((entry.sessionEndTime - entry.sessionStartTime)/60000);
    sessionHtml = `<div>最終学習セッション: ${new Date(entry.sessionStartTime).toLocaleString()} ～ ${new Date(entry.sessionEndTime).toLocaleString()}（${min}分）</div>`;
  }

  document.getElementById('statsContent').innerHTML = `
    <div style='margin-bottom:10px;'><b>タイトル:</b> ${entry.title || entry.name}</div>
    <div style='margin-bottom:10px;'><b>統計サマリー:</b> 正解${totalCorrect}回, 間違い${totalWrong}回, 総学習回数${totalHistory}回</div>
    ${sessionHtml}
    <h4>単語ごとの習得状況</h4>
    ${tableHtml}
    ${historyHtml}
  `;
  
  // デバッグ情報を追加
  showDebugInfo(`統計HTML生成完了: サマリー=${totalCorrect}/${totalWrong}/${totalHistory}, テーブル行数=${words.length}, 履歴行数=${historyRows.length}`);
  
  // 統計ポップアップを表示
  const statsPopup = document.getElementById('statsPopup');
  if (statsPopup) {
    statsPopup.style.display = 'flex';
    showDebugInfo('統計ポップアップを表示しました');
  } else {
    showDebugInfo('エラー: statsPopup要素が見つかりません');
  }
  
  // 統計読み込み完了メッセージを右下に表示
  showStatsCompleteMessage(entry.title || entry.name);
}
document.getElementById('closeStatsBtn').onclick = function() {
  document.getElementById('statsPopup').style.display = 'none';
};

// 全体統計グラフ描画
function drawGlobalStats() {
  showDebugInfo(`=== 全体統計描画開始 ===`);
  
  // data.jsonから新しい形式のセッション記録を読み取り
  let dataJsonSessions = [];
  try {
    const dataJsonData = localStorage.getItem('dataJson');
    if (dataJsonData) {
      const parsedData = JSON.parse(dataJsonData);
      if (parsedData.sessions && Array.isArray(parsedData.sessions)) {
        dataJsonSessions = parsedData.sessions;
        showDebugInfo(`data.jsonからセッション記録を読み取り: ${dataJsonSessions.length}件`);
      }
    }
  } catch (e) {
    showDebugInfo(`data.json読み込みエラー: ${e.message}`);
  }
  
  // 期間選択
  const period = document.getElementById('globalReviewPeriod')?.value || 'year';
  showDebugInfo(`表示期間: ${period}`);
  
  // 集計用
  let reviewCounts = {};
  let retentionCats = { '未学習': 0, '定着低': 0, '定着中': 0, '定着高': 0 };
  let totalSessions = 0;
  let totalXP = 0;
  let totalNewWords = 0;
  let totalReviewWords = 0;
  let averageGrade = 0;
  let gradeCount = 0;
  
  // data.jsonのセッション記録から統計を集計
  dataJsonSessions.forEach(session => {
    if (session.length >= 8) {
      // 新しい形式のデータ
      const [timestamp, wordbookTitle, duration, xp, answerSpeed, newWords, reviewWords, grade] = session;
      
      // 日付解析
      const dateParts = timestamp.split('.');
      if (dateParts.length === 6) {
        const [year, month, day, hour, minute, second] = dateParts.map(Number);
        const sessionDate = new Date(year, month - 1, day, hour, minute, second);
        
        // 期間別の復習回数集計
        let key = '';
        if (period === 'year') key = year.toString();
        else if (period === 'month') key = `${year}-${month.toString().padStart(2, '0')}`;
        else if (period === 'week') {
          const first = new Date(year, 0, 1);
          const week = Math.ceil((((sessionDate - first) / 86400000) + first.getDay() + 1) / 7);
          key = `${year}-W${week}`;
        } else {
          key = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
        
        reviewCounts[key] = (reviewCounts[key] || 0) + 1;
        
        // 統計データを累積
        totalSessions++;
        totalXP += xp || 0;
        totalNewWords += newWords || 0;
        totalReviewWords += reviewWords || 0;
        
        if (grade && grade > 0) {
          averageGrade += parseFloat(grade);
          gradeCount++;
        }
        
        showDebugInfo(`セッション: ${wordbookTitle}, 時間: ${duration}分, XP: ${xp}, 新規: ${newWords}, 復習: ${reviewWords}, 評価: ${grade}`);
      }
    }
  });
  
  // 平均評価を計算
  if (gradeCount > 0) {
    averageGrade = (averageGrade / gradeCount).toFixed(2);
  }
  
  showDebugInfo(`統計集計完了: セッション${totalSessions}件, 総XP${totalXP}, 新規単語${totalNewWords}, 復習単語${totalReviewWords}, 平均評価${averageGrade}`);
  
  // 定着度カテゴリを新しい形式のデータから計算
  dataJsonSessions.forEach(session => {
    if (session.length >= 8) {
      const [timestamp, wordbookTitle, duration, xp, answerSpeed, newWords, reviewWords, grade] = session;
      const gradeValue = parseFloat(grade) || 0;
      
      if (gradeValue === 0) {
        retentionCats['未学習']++;
      } else if (gradeValue < 0.8) {
        retentionCats['定着低']++;
      } else if (gradeValue < 1.2) {
        retentionCats['定着中']++;
      } else {
        retentionCats['定着高']++;
      }
    }
  });
  
  showDebugInfo(`復習回数データ: ${Object.keys(reviewCounts).length}期間`);
  showDebugInfo(`定着度カテゴリ: ${JSON.stringify(retentionCats)}`);
  
  // グラフ用データ整形
  let labels = Object.keys(reviewCounts).sort();
  let data = labels.map(k=>reviewCounts[k]);
  
  showDebugInfo(`グラフラベル: ${labels.join(', ')}`);
  showDebugInfo(`グラフデータ: ${data.join(', ')}`);
  
  // セッション記録の表示を追加（新しい形式）
  let sessionHtml = '';
  if (dataJsonSessions.length > 0) {
    sessionHtml = '<h4>最近の復習セッション</h4>';
    sessionHtml += '<div style="max-height: 200px; overflow-y: auto; margin-bottom: 20px;">';
    sessionHtml += '<table class="stats-table"><tr><th>日時</th><th>単語帳</th><th>学習時間</th><th>XP</th><th>新規単語</th><th>復習単語</th><th>平均評価</th></tr>';
    
    dataJsonSessions.slice(0, 20).forEach(session => {
      if (session.length >= 8) {
        const [timestamp, wordbookTitle, duration, xp, answerSpeed, newWords, reviewWords, grade] = session;
        
        // タイムスタンプを日時に変換
        const dateParts = timestamp.split('.');
        if (dateParts.length === 6) {
          const [year, month, day, hour, minute, second] = dateParts.map(Number);
          const sessionDate = new Date(year, month - 1, day, hour, minute, second);
          const dateStr = sessionDate.toLocaleDateString('ja-JP');
          const timeStr = sessionDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          
          sessionHtml += `<tr>
            <td>${dateStr} ${timeStr}</td>
            <td>${wordbookTitle}</td>
            <td>${duration}分</td>
            <td>${xp}</td>
            <td>${newWords}</td>
            <td>${reviewWords}</td>
            <td>${grade}</td>
          </tr>`;
        }
      }
    });
    
    sessionHtml += '</table></div>';
  }
  
  // レンダリング
  requestAnimationFrame(() => {
    setTimeout(()=>{
    try {
      // 折れ線グラフ
      const chartCanvas = document.getElementById('globalReviewChart');
      if (!chartCanvas) {
        showDebugInfo('エラー: globalReviewChart要素が見つかりません');
        showDebugInfo('利用可能な要素: ' + document.querySelectorAll('canvas').length + '個のcanvas要素');
        return;
      }
      
      showDebugInfo(`折れ線グラフ用canvas要素を発見: ${chartCanvas.id}`);
      
      // データが空の場合はデフォルトデータを表示
      if (labels.length === 0 || data.length === 0) {
        showDebugInfo('復習データがありません。デフォルトデータを表示します。');
        labels = ['データなし'];
        data = [0];
      }
      
      const ctx = chartCanvas.getContext('2d');
      if (window.globalReviewChartInstance) window.globalReviewChartInstance.destroy();
      window.globalReviewChartInstance = new Chart(ctx, {
        type: 'line',
        data: { 
          labels, 
          datasets: [{ 
            label: '復習回数', 
            data, 
            borderColor: '#2980b9', 
            backgroundColor: 'rgba(52,152,219,0.2)', 
            fill: true 
          }] 
        },
        options: { 
          responsive: true, 
          plugins: { 
            legend: { position: 'top' }, 
            title: { display: false } 
          }, 
          scales: { 
            x: { ticks: { font: { size: 10 } } }, 
            y: { beginAtZero: true } 
          } 
        }
      });
      showDebugInfo('折れ線グラフ描画完了');
      
      // 円グラフ
      const pieCanvas = document.getElementById('globalRetentionPieChart');
      if (!pieCanvas) {
        showDebugInfo('エラー: globalRetentionPieChart要素が見つかりません');
        showDebugInfo('利用可能な要素: ' + document.querySelectorAll('canvas').length + '個のcanvas要素');
        return;
      }
      
      showDebugInfo(`円グラフ用canvas要素を発見: ${pieCanvas.id}`);
      
      // 定着度データが空の場合はデフォルトデータを表示
      const pieLabels = Object.keys(retentionCats);
      const pieData = Object.values(retentionCats);
      if (pieData.every(val => val === 0)) {
        showDebugInfo('定着度データがありません。デフォルトデータを表示します。');
        retentionCats = { '未学習': 1 };
      }
      
      const ctx2 = pieCanvas.getContext('2d');
      if (window.globalRetentionPieChartInstance) window.globalRetentionPieChartInstance.destroy();
      window.globalRetentionPieChartInstance = new Chart(ctx2, {
        type: 'pie',
        data: { 
          labels: Object.keys(retentionCats), 
          datasets: [{ 
            data: Object.values(retentionCats), 
            backgroundColor: [ 'rgba(189, 195, 199, 0.8)', 'rgba(231, 76, 60, 0.7)', 'rgba(241, 196, 15, 0.7)', 'rgba(46, 204, 113, 0.7)' ] 
          }] 
        },
        options: { 
          responsive: true, 
          plugins: { 
            legend: { position: 'top' }, 
            title: { display: false } 
          } 
        }
      });
      showDebugInfo('円グラフ描画完了');
      
      // セッション記録を表示
      const globalStatsContent = document.querySelector('#globalStatsPopup .popup-content');
      if (globalStatsContent && sessionHtml) {
        // 既存のセッション記録を削除
        const existingSessionDiv = globalStatsContent.querySelector('.session-records');
        if (existingSessionDiv) {
          existingSessionDiv.remove();
        }
        
        // セッション記録を追加
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'session-records';
        sessionDiv.innerHTML = sessionHtml;
        globalStatsContent.appendChild(sessionDiv);
      }
      
      showDebugInfo('全体統計グラフ描画完了');
    } catch (error) {
      showDebugInfo(`グラフ描画エラー: ${error.message}`);
      showDebugInfo(`エラーの詳細: ${error.stack}`);
    }
    }, 100); // 遅延を100msに増加
  });
}

// 統計読み込み完了メッセージを右下に表示
function showStatsCompleteMessage(title) {
  // 既存の完了メッセージがあれば削除
  const existingMessage = document.getElementById('statsCompleteMessage');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  // 完了メッセージを作成
  const messageDiv = document.createElement('div');
  messageDiv.id = 'statsCompleteMessage';
  messageDiv.style.position = 'fixed';
  messageDiv.style.right = '24px';
  messageDiv.style.bottom = '100px'; // 新規ボタンの上に表示
  messageDiv.style.background = 'rgba(46, 204, 113, 0.9)';
  messageDiv.style.color = 'white';
  messageDiv.style.padding = '12px 16px';
  messageDiv.style.borderRadius = '8px';
  messageDiv.style.fontSize = '14px';
  messageDiv.style.fontWeight = 'bold';
  messageDiv.style.zIndex = '2001';
  messageDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  messageDiv.style.transition = 'opacity 0.3s ease-in-out';
  messageDiv.textContent = `${title}読み込み:完了`;
  
  document.body.appendChild(messageDiv);
  
  // 3秒後にフェードアウト
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.style.opacity = '0';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 300);
    }
  }, 3000);
}

// data.json読み込み完了メッセージを表示
function showDataJsonLoadMessage(message) {
  // 既存のメッセージがあれば削除
  const existingMessage = document.getElementById('dataJsonLoadMessage');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  // メッセージを作成
  const messageDiv = document.createElement('div');
  messageDiv.id = 'dataJsonLoadMessage';
  messageDiv.style.position = 'fixed';
  messageDiv.style.right = '24px';
  messageDiv.style.bottom = '150px'; // 統計メッセージの上に表示
  messageDiv.style.background = 'rgba(52, 152, 219, 0.9)';
  messageDiv.style.color = 'white';
  messageDiv.style.padding = '12px 16px';
  messageDiv.style.borderRadius = '8px';
  messageDiv.style.fontSize = '14px';
  messageDiv.style.fontWeight = 'bold';
  messageDiv.style.zIndex = '2001';
  messageDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  messageDiv.style.transition = 'opacity 0.3s ease-in-out';
  messageDiv.textContent = message;
  
  document.body.appendChild(messageDiv);
  
  // 3秒後にフェードアウト
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.style.opacity = '0';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 300);
    }
  }, 3000);
}

// 統計の記録状況を確認・表示
async function showStatsStatus() {
  // デバッグモードがOFFの場合は何もしない
  if (!debugMode) {
    console.log('デバッグモードがOFFのため、統計状況確認画面は表示されません');
    return;
  }
  
  showDebugInfo('統計状況確認開始');
  
  // 現在の単語帳のハッシュを取得
  const currentHash = getCurrentWordbookHash();
  
  // 履歴データを取得
  const historyList = await getHistoryList();
  
  // localStorageから進捗データを取得
  let allProgress = {};
  try {
    const storedData = localStorage.getItem("allProgressData");
    if (storedData) {
      allProgress = JSON.parse(storedData);
    }
  } catch (error) {
    showDebugInfo(`localStorage読み込みエラー: ${error.message}`);
  }
  
  // 統計状況を集計
  let statsSummary = [];
  statsSummary.push(`=== 統計記録状況 ===`);
  statsSummary.push(`履歴エントリ数: ${historyList.length}`);
  statsSummary.push(`進捗データ単語帳数: ${Object.keys(allProgress).length}`);
  statsSummary.push(`総XP: ${totalXP}`);
  statsSummary.push(`現在のレベル: ${currentLevel}`);
  statsSummary.push(`次のレベルまで: ${Math.floor(Math.pow(1.2, currentLevel))} XP`);
  statsSummary.push(`連続学習日数: ${localStorage.getItem('loginStreak') || '0'}日`);
  statsSummary.push(`最終学習日: ${localStorage.getItem('lastLoginDate') || 'なし'}`);
  
  // 現在のセッション情報
  if (sessionStartTime) {
    const sessionDuration = sessionEndTime ? Math.round((sessionEndTime - sessionStartTime) / 1000) : Math.round((Date.now() - sessionStartTime) / 1000);
    statsSummary.push(`\n=== 現在のセッション情報 ===`);
    statsSummary.push(`セッション開始時刻: ${new Date(sessionStartTime).toLocaleString()}`);
    if (sessionEndTime) {
      statsSummary.push(`セッション終了時刻: ${new Date(sessionEndTime).toLocaleString()}`);
    }
    statsSummary.push(`セッション時間: ${sessionDuration}秒`);
    statsSummary.push(`現在の問題インデックス: ${currentIndex}/${quizQueue.length}`);
    statsSummary.push(`正解数: ${correctCount}`);
    statsSummary.push(`間違いリスト数: ${wrongList.length}`);
    
    // 現在の問題情報
    if (currentWord) {
      statsSummary.push(`\n現在の問題:`);
      statsSummary.push(`  問題: ${currentWord.question}`);
      statsSummary.push(`  答え: ${currentWord.answer}`);
      if (currentWord.reading) {
        statsSummary.push(`  読み: ${currentWord.reading}`);
      }
    }
    
    // クイズキューの詳細
    if (quizQueue.length > 0) {
      statsSummary.push(`\nクイズキュー (${quizQueue.length}問):`);
      quizQueue.forEach((word, index) => {
        const isCurrent = index === currentIndex;
        const isWrong = wrongList.includes(word);
        const progress = progressData[word.question];
        const historyCount = progress?.history?.length || 0;
        
        statsSummary.push(`  ${index + 1}. ${word.question}${isCurrent ? ' [現在]' : ''}${isWrong ? ' [間違い]' : ''} (履歴: ${historyCount}件)`);
      });
    }
    
    // 問題ごとの所要時間
    if (questionTimes.length > 0) {
      statsSummary.push(`\n問題ごとの所要時間:`);
      questionTimes.forEach((qt, index) => {
        statsSummary.push(`  ${index + 1}. ${qt.question}: ${Math.round(qt.time / 1000)}秒`);
      });
    }
  }
  
  // 現在の単語帳情報
  if (currentHash) {
    const currentProgress = allProgress[currentHash] || {};
    const currentWords = Object.keys(currentProgress);
    const currentHistoryCount = Object.values(currentProgress).reduce((sum, p) => {
      return sum + (p.history ? p.history.length : 0);
    }, 0);
    
    statsSummary.push(`\n=== 現在の単語帳情報 ===`);
    statsSummary.push(`ハッシュ: ${currentHash}`);
    statsSummary.push(`総単語数: ${allWords.length}`);
    statsSummary.push(`問題数: ${newWordCount + reviewWordCount} (新出${newWordCount} + 復習${reviewWordCount})`);
    statsSummary.push(`進捗記録単語数: ${currentWords.length}`);
    statsSummary.push(`総学習履歴数: ${currentHistoryCount}`);
    
    // 現在のセッションのprogressDataも確認
    if (Object.keys(progressData).length > 0) {
      const sessionWords = Object.keys(progressData);
      const sessionHistoryCount = Object.values(progressData).reduce((sum, p) => {
        return sum + (p.history ? p.history.length : 0);
      }, 0);
      
      statsSummary.push(`\n現在セッション:`);
      statsSummary.push(`  単語数: ${sessionWords.length}`);
      statsSummary.push(`  履歴数: ${sessionHistoryCount}`);
    }
    
    // 優先度順に並べられた単語の表示
    if (allWords.length > 0) {
      statsSummary.push(`\n=== 単語の優先度順 ===`);
      
      // 定着状況を判定する関数
      function getRetentionStatus(word) {
        const progress = progressData[word.question];
        if (!progress || !progress.history || progress.history.length === 0) {
          return '未学習';
        }
        
        const history = progress.history;
        const correctCount = history.filter(h => h.grade === 'easy' || h.grade === 'normal').length;
        const wrongCount = history.filter(h => h.grade === 'again' || h.grade === 'hard').length;
        const total = correctCount + wrongCount;
        
        if (total === 0) return '未学習';
        
        const correctRate = correctCount / total;
        const reviewCount = history.length;
        
        // 直近2回の復習間隔
        let intervalDays = 0;
        if (history.length >= 2) {
          const last = history[history.length-1].timestamp;
          const prev = history[history.length-2].timestamp;
          intervalDays = (last - prev) / (1000*60*60*24);
        } else if (history.length === 1) {
          intervalDays = (Date.now() - history[0].timestamp) / (1000*60*60*24);
        }
        
        let intervalCoef = 1.0;
        if (intervalDays < 1) intervalCoef = 0.5;
        else if (intervalDays < 3) intervalCoef = 0.8;
        else if (intervalDays < 7) intervalCoef = 0.9;
        
        const score = correctRate * Math.log(reviewCount+1) * intervalCoef;
        
        if (score < 0.3) return '定着低';
        else if (score < 0.7) return '定着中';
        else return '定着高';
      }
      
      // 全単語を優先度順にソート
      const sortedWords = sortWordsByPriority([...allWords]);
      
      // 表形式で表示
      statsSummary.push(`| 順位 | 単語 | 優先度 | 定着状況 | 最終評価 | 履歴数 |`);
      statsSummary.push(`|------|------|--------|----------|----------|--------|`);
      
      sortedWords.forEach((word, index) => {
        const priority = calculateWordPriority(word);
        const retentionStatus = getRetentionStatus(word);
        const progress = progressData[word.question];
        const history = progress?.history || [];
        const lastGrade = history.length > 0 ? history[history.length - 1].grade : '-';
        const historyCount = history.length;
        
        statsSummary.push(`| ${index + 1} | ${word.question} | ${priority.toFixed(4)} | ${retentionStatus} | ${lastGrade} | ${historyCount} |`);
      });
    }
    
    // 間違いリストの優先度順
    if (wrongList.length > 0) {
      statsSummary.push(`\n=== 間違いリスト (優先度順) ===`);
      const sortedWrongList = [...wrongList].sort((a, b) => {
        const priorityA = calculateWordPriority(a);
        const priorityB = calculateWordPriority(b);
        return priorityB - priorityA;
      });
      
      sortedWrongList.forEach((word, index) => {
        const priority = calculateWordPriority(word);
        const sessionWrongCount = sessionWrongCounts[word.question] || 0;
        statsSummary.push(`  ${index + 1}. ${word.question} (優先度: ${priority.toFixed(4)}, セッション間違い数: ${sessionWrongCount})`);
      });
    }
  }
  
  // 各単語帳の詳細情報
  if (historyList.length > 0) {
    statsSummary.push(`\n=== 各単語帳の詳細 ===`);
    historyList.forEach((entry, index) => {
      const hash = entry.hash;
      const progress = allProgress[hash] || {};
      const words = Object.keys(progress);
      const historyCount = Object.values(progress).reduce((sum, p) => {
        return sum + (p.history ? p.history.length : 0);
      }, 0);
      
      statsSummary.push(`  ${index + 1}. ${entry.title || entry.name}`);
      statsSummary.push(`    ハッシュ: ${hash}`);
      statsSummary.push(`    進捗記録単語数: ${words.length}`);
      statsSummary.push(`    総学習履歴数: ${historyCount}`);
      if (entry.sessionStartTime && entry.sessionEndTime) {
        const duration = Math.round((entry.sessionEndTime - entry.sessionStartTime) / 1000);
        statsSummary.push(`    最終セッション時間: ${duration}秒`);
      }
    });
  }
  
  // システム情報
  statsSummary.push(`\n=== システム情報 ===`);
  statsSummary.push(`ブラウザ: ${navigator.userAgent}`);
  statsSummary.push(`プラットフォーム: ${navigator.platform}`);
  statsSummary.push(`言語: ${navigator.language}`);
  statsSummary.push(`現在時刻: ${new Date().toLocaleString()}`);
  statsSummary.push(`デバッグモード: ${debugMode ? 'ON' : 'OFF'}`);
  
  // 統計状況をポップアップで表示
  showStatsStatusPopup(statsSummary.join('\n'));
}

// 統計状況確認ポップアップを表示
function showStatsStatusPopup(content) {
  // 既存のポップアップがあれば削除
  const existingPopup = document.getElementById('statsStatusPopup');
  if (existingPopup) {
    existingPopup.remove();
  }
  
  // ポップアップを作成
  const popup = document.createElement('div');
  popup.id = 'statsStatusPopup';
  popup.style.position = 'fixed';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.background = 'white';
  popup.style.border = '2px solid #3498db';
  popup.style.borderRadius = '8px';
  popup.style.padding = '20px';
  popup.style.maxWidth = '600px';
  popup.style.maxHeight = '80vh';
  popup.style.overflow = 'auto';
  popup.style.zIndex = '5000';
  popup.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
  popup.style.fontFamily = 'monospace';
  popup.style.fontSize = '14px';
  popup.style.lineHeight = '1.4';
  
  // タイトル
  const title = document.createElement('h3');
  title.textContent = '📊 統計記録状況';
  title.style.margin = '0 0 15px 0';
  title.style.color = '#3498db';
  title.style.textAlign = 'center';
  popup.appendChild(title);
  
  // 内容
  const contentDiv = document.createElement('div');
  contentDiv.style.whiteSpace = 'pre-line';
  contentDiv.textContent = content;
  popup.appendChild(contentDiv);
  
  // 閉じるボタン
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '閉じる';
  closeBtn.style.display = 'block';
  closeBtn.style.margin = '20px auto 0 auto';
  closeBtn.style.padding = '10px 20px';
  closeBtn.style.background = '#3498db';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '5px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => {
    overlay.remove();
    popup.remove();
  };
  popup.appendChild(closeBtn);
  
  // 背景オーバーレイ
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.zIndex = '4999';
  overlay.onclick = () => {
    overlay.remove();
    popup.remove();
  };
  
  document.body.appendChild(overlay);
  document.body.appendChild(popup);
  
  // ESCキーでも閉じられるように
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      popup.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
  
  // ポップアップが削除されたときにイベントリスナーも削除
  const observer = new MutationObserver(() => {
    if (!document.body.contains(popup)) {
      document.removeEventListener('keydown', handleEsc);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// 単語帳ごとの個別JSONファイルへの履歴保存
async function saveProgressToWordbookFile() {
  try {
    // 現在の単語帳の情報を取得
    const currentHash = getCurrentWordbookHash();
    if (!currentHash) {
      showDebugInfo(`エラー: 現在の単語帳のハッシュが取得できません`);
      return;
    }
    
    // 履歴から現在の単語帳名を取得
    const historyList = await getHistoryList();
    const currentEntry = historyList.find(e => e.hash === currentHash);
    if (!currentEntry) {
      showDebugInfo(`エラー: 現在の単語帳の履歴が見つかりません`);
      return;
    }
    
    // 単語帳名からファイル名を生成（.csvを除去）
    const wordbookName = currentEntry.title || currentEntry.name || 'unknown';
    const fileName = `${wordbookName}.json`;
    
    showDebugInfo(`単語帳個別保存開始: ${wordbookName} -> ${fileName}`);
    
    // 現在の日時を取得
    const now = new Date();
    const timestamp = now.toISOString();
    
    // 保存データの構造（単語帳ごと）
    const saveData = {
      wordbookName: wordbookName,
      hash: currentHash,
      timestamp: timestamp,
      version: "1.0",
      lastUpdated: timestamp,
      systemInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        lastUpdated: timestamp
      }
    };
    
    // 現在の単語帳の進捗データを取得
    let currentProgress = {};
    try {
      const storedData = localStorage.getItem("allProgressData");
      if (storedData) {
        const allProgress = JSON.parse(storedData);
        currentProgress = allProgress[currentHash] || {};
        showDebugInfo(`単語帳個別保存: 進捗データを読み込み - 単語数: ${Object.keys(currentProgress).length}`);
      }
    } catch (error) {
      showDebugInfo(`単語帳個別保存: 進捗データ読み込みエラー - ${error.message}`);
    }
    
    // 現在学習中の場合はprogressDataも追加
    if (Object.keys(progressData).length > 0) {
      showDebugInfo(`単語帳個別保存: 現在の進捗データを追加: ${Object.keys(progressData).length}個`);
      currentProgress = { ...currentProgress, ...progressData };
      showDebugInfo(`単語帳個別保存: マージ後のデータ: ${Object.keys(currentProgress).length}個の単語`);
    }
    
    // 進捗データを保存
    saveData.progress = currentProgress;
    saveData.totalWords = Object.keys(currentProgress).length;
    
    // 学習統計を計算
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalHistory = 0;
    
    Object.values(currentProgress).forEach(wordProgress => {
      if (wordProgress.history) {
        const correctCount = wordProgress.history.filter(h => h.grade === 'easy' || h.grade === 'normal').length;
        const wrongCount = wordProgress.history.filter(h => h.grade === 'again' || h.grade === 'hard').length;
        totalCorrect += correctCount;
        totalWrong += wrongCount;
        totalHistory += wordProgress.history.length;
      }
    });
    
    saveData.statistics = {
      totalCorrect: totalCorrect,
      totalWrong: totalWrong,
      totalHistory: totalHistory,
      totalAttempts: totalCorrect + totalWrong
    };
    
    // 単語帳の基本情報も追加
    saveData.wordbookInfo = {
      title: currentEntry.title || currentEntry.name,
      hash: currentEntry.hash,
      content: currentEntry.content,
      settings: currentEntry.settings || {},
      sessionStartTime: sessionStartTime,
      sessionEndTime: sessionEndTime
    };
    
    // JSONファイルとして保存
    const dataStr = JSON.stringify(saveData, null, 2);
    
    // ファイルの存在確認
    let fileExists = false;
    let existingFileHandle = null;
    
    try {
      // 既存のファイルを開こうとしてみる
      const fileHandles = await window.showOpenFilePicker({
        id: 'wordbook',
        multiple: false,
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] }
        }]
      });
      
      if (fileHandles && fileHandles.length > 0) {
        existingFileHandle = fileHandles[0];
        // ファイル名を確認
        const existingFileName = existingFileHandle.name;
        if (existingFileName === fileName) {
          fileExists = true;
          showDebugInfo(`既存のファイルが見つかりました: ${existingFileName}`);
        } else {
          showDebugInfo(`異なるファイル名のファイルが見つかりました: ${existingFileName}`);
        }
      }
    } catch (error) {
      showDebugInfo(`既存ファイルの確認中にエラーが発生: ${error.message}`);
    }
    
    if (fileExists && existingFileHandle) {
      // 既存のファイルを更新
      try {
        const writable = await existingFileHandle.createWritable();
        await writable.write(dataStr);
        await writable.close();
        showDebugInfo(`既存ファイルを更新しました: ${fileName}`);
      } catch (error) {
        showDebugInfo(`既存ファイルの更新に失敗: ${error.message}`);
        // 更新に失敗した場合は新規作成にフォールバック
        fileExists = false;
      }
    }
    
    if (!fileExists) {
      // 新規ファイルを作成
      try {
        const newFileHandle = await window.showSaveFilePicker({
          id: 'wordbook',
          suggestedName: fileName,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }]
        });
        
        const writable = await newFileHandle.createWritable();
        await writable.write(dataStr);
        await writable.close();
        
        showDebugInfo(`新規ファイルを作成しました: ${fileName}`);
        
      } catch (fileError) {
        showDebugInfo(`File System Access APIエラー: ${fileError.message}`);
        
        // フォールバック: ダウンロードリンクで保存
        showDebugInfo(`フォールバック: ダウンロードリンクで保存`);
        downloadWordbookFile(fileName, dataStr);
      }
    }
    
  } catch (error) {
    showDebugInfo(`単語帳個別保存エラー: ${error.message}`);
    // エラーが発生した場合もダウンロードリンクで保存
    const wordbookName = currentEntry?.title || currentEntry?.name || 'unknown';
    const fileName = `${wordbookName}.json`;
    downloadWordbookFile(fileName, dataStr);
  }
}

// 単語帳ファイルをダウンロードする関数
function downloadWordbookFile(fileName, dataStr) {
  // 既存のリンクがあれば削除
  const existingLink = document.getElementById('wordbookSaveLink');
  if (existingLink) {
    existingLink.remove();
  }
  
  // ダウンロードリンクを作成
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  const link = document.createElement('a');
  link.id = 'wordbookSaveLink';
  link.href = URL.createObjectURL(dataBlob);
  link.download = fileName;
  link.textContent = `${fileName}をダウンロード`;
  link.style.display = 'inline-block';
  link.style.padding = '10px 20px';
  link.style.background = '#3498db';
  link.style.color = 'white';
  link.style.textDecoration = 'none';
  link.style.borderRadius = '5px';
  link.style.margin = '10px';
  link.style.fontWeight = 'bold';
  
  // 説明テキストを追加
  const description = document.createElement('div');
  description.textContent = `単語帳「${fileName.replace('.json', '')}」の学習履歴を保存するために、このファイルをダウンロードしてください。`;
  description.style.margin = '10px';
  description.style.color = '#666';
  description.style.fontSize = '14px';
  
  // ページに表示
  const container = document.getElementById('menuScreen') || document.body;
  container.appendChild(description);
  container.appendChild(link);
  
  showDebugInfo(`単語帳ファイルのダウンロードリンクを表示しました: ${fileName}`);
  
  // 自動ダウンロードを試行（ユーザーが許可した場合）
  setTimeout(() => {
    try {
      link.click();
      showDebugInfo(`自動ダウンロードを実行しました: ${fileName}`);
    } catch (error) {
      showDebugInfo(`自動ダウンロードに失敗: ${error.message}`);
    }
  }, 1000);
}

// XPを計算・更新
function calculateAndUpdateXP() {
  let allProgress = {};
  try {
    const storedData = localStorage.getItem("allProgressData");
    if (storedData) {
      allProgress = JSON.parse(storedData);
    }
  } catch (error) {
    showDebugInfo(`XP計算エラー: ${error.message}`);
    return;
  }
  
  let newTotalXP = 0;
  
  // 各単語帳のXPを計算
  Object.values(allProgress).forEach(progress => {
    Object.values(progress).forEach(wordProgress => {
      if (wordProgress.history && wordProgress.history.length > 0) {
        // 習得状況に応じたXP計算
        const totalAttempts = wordProgress.history.length;
        const correctAttempts = wordProgress.history.filter(h => 
          h.grade === 'easy' || h.grade === 'normal'
        ).length;
        const wrongAttempts = wordProgress.history.filter(h => 
          h.grade === 'again' || h.grade === 'hard'
        ).length;
        
        // 間違えた回数が多いほど高XP（習得が困難な単語）
        let wordXP = 0;
        if (totalAttempts > 0) {
          const difficultyBonus = Math.min(wrongAttempts * 5, 50); // 最大50XPの難易度ボーナス
          const consistencyBonus = Math.min(totalAttempts * 2, 30); // 最大30XPの継続ボーナス
          const accuracyBonus = Math.max(0, (correctAttempts - wrongAttempts) * 3); // 正解ボーナス
          
          wordXP = 10 + difficultyBonus + consistencyBonus + accuracyBonus;
        }
        
        newTotalXP += wordXP;
      }
    });
  });
  
  // 連続記録ボーナス
  const streak = parseInt(localStorage.getItem('loginStreak') || '0', 10);
  const streakBonus = Math.min(streak * 2, 100); // 最大100XPの連続記録ボーナス
  newTotalXP += streakBonus;
  
  // 一度に獲得できるXPの上限を設定（レベルアップ制限のため）
  const maxXPPerSession = 200; // 1回のセッションで最大200XPまで
  const previousXP = totalXP;
  const xpGain = newTotalXP - previousXP;
  
  if (xpGain > maxXPPerSession) {
    newTotalXP = previousXP + maxXPPerSession;
    showDebugInfo(`XP獲得制限: ${xpGain} → ${maxXPPerSession} (1回のセッション上限)`);
  }
  
  totalXP = newTotalXP;
  
  // レベル計算（1.2^(l-1)の式を使用）
  // 現在のレベルを保存（レベルアップ制限のため）
  const previousLevel = currentLevel;
  
  // 新しいレベルを計算
  let calculatedLevel = 1;
  let levelXP = 0;
  
  // 1.2^(l-1)の式でレベルを計算
  while (totalXP >= levelXP) {
    calculatedLevel++;
    levelXP = Math.pow(1.2, calculatedLevel - 1);
  }
  
  let newLevel = calculatedLevel - 1;
  
  // 一度に1レベルしか上がらないように制限
  if (newLevel > previousLevel + 1) {
    newLevel = previousLevel + 1;
    showDebugInfo(`レベルアップ制限: ${previousLevel} → ${newLevel} (1レベルずつ)`);
  }
  
  // さらに、現在のレベルから次のレベルに必要なXPを超えないように制限
  // 1.2^(l-1)と10の大きい方を採用
  const calculatedRequiredXP = Math.floor(Math.pow(1.2, previousLevel));
  const minimumRequiredXP = 10;
  const nextLevelRequiredXP = Math.max(calculatedRequiredXP, minimumRequiredXP);
  
  showDebugInfo(`レベルアップ判定: 必要XP=${nextLevelRequiredXP} (計算値=${calculatedRequiredXP}, 最小値=${minimumRequiredXP}), 現在XP=${totalXP}`);
  
  if (totalXP < nextLevelRequiredXP) {
    newLevel = previousLevel;
    showDebugInfo(`XP不足のためレベルアップできません: 必要XP=${nextLevelRequiredXP}, 現在XP=${totalXP}`);
  }
  
  currentLevel = newLevel;
  
  // 次のレベルに必要なXPを計算（1.2^(l-1)と10の大きい方）
  const calculatedNextLevelXP = Math.floor(Math.pow(1.2, currentLevel));
  const minimumNextLevelXP = 10;
  nextLevelXP = Math.max(calculatedNextLevelXP, minimumNextLevelXP);
  
  showDebugInfo(`次のレベルXP計算: 1.2^${currentLevel}=${calculatedNextLevelXP}, 最小値=10, 採用=${nextLevelXP}`);
  
  // レベルアップが発生した場合のログ
  if (currentLevel > previousLevel) {
    showDebugInfo(`レベルアップ: ${previousLevel} → ${currentLevel}`);
  } else if (currentLevel === previousLevel) {
    showDebugInfo(`レベル変更なし: ${currentLevel} (XP不足または制限により)`);
  }
  
  // レベルアップ制限の詳細ログ
  showDebugInfo(`レベル計算詳細: 前回=${previousLevel}, 計算値=${calculatedLevel - 1}, 制限後=${currentLevel}`);
  showDebugInfo(`XP状況: 現在=${totalXP}, 次のレベル必要XP=${nextLevelXP}`);
  
  // localStorageに保存
  localStorage.setItem('totalXP', totalXP.toString());
  localStorage.setItem('currentLevel', currentLevel.toString());
  
  // 表示を更新
  updateXPDisplay();
  
  showDebugInfo(`XP計算完了: 総XP=${totalXP}, レベル=${currentLevel}, 次のレベルまで=${Math.round(nextLevelXP)} XP, 連続記録ボーナス=${streakBonus}`);
}

// XP表示を更新
function updateXPDisplay() {
  const totalXPElement = document.getElementById('totalXP');
  const currentLevelElement = document.getElementById('currentLevel');
  const nextLevelXPElement = document.getElementById('nextLevelXP');
  
  if (totalXPElement) totalXPElement.textContent = `総XP: ${totalXP}`;
  if (currentLevelElement) currentLevelElement.textContent = `レベル: ${currentLevel}`;
  if (nextLevelXPElement) {
    const remainingXP = nextLevelXP - totalXP;
    nextLevelXPElement.textContent = `次のレベルまで: ${remainingXP} XP`;
  }
}

// XPを読み込み
function loadXP() {
  totalXP = parseInt(localStorage.getItem('totalXP') || '0', 10);
  currentLevel = parseInt(localStorage.getItem('currentLevel') || '1', 10);
  
  // 1.2^(l-1)の式で次のレベルに必要なXPを計算（小数点以下切り下げ）
  // 1.2^(l-1)と10の大きい方を採用
  const calculatedNextLevelXP = Math.floor(Math.pow(1.2, currentLevel));
  const minimumNextLevelXP = 10;
  nextLevelXP = Math.max(calculatedNextLevelXP, minimumNextLevelXP);
  
  showDebugInfo(`loadXP: レベル=${currentLevel}, 計算値=${calculatedNextLevelXP}, 最小値=${minimumNextLevelXP}, 採用=${nextLevelXP}`);
  
  updateXPDisplay();
}

// セッション記録を読み込み
function loadSessionData() {
  try {
    const sessionData = localStorage.getItem('sessionData');
    if (sessionData) {
      const data = JSON.parse(sessionData);
      showDebugInfo(`セッション記録を読み込み: ${data.sessions ? data.sessions.length : 0}件`);
      
      // セッション記録を読み込んだ後にXPを更新
      calculateAndUpdateXP();
      
      return data;
    }
  } catch (error) {
    showDebugInfo(`セッション記録読み込みエラー: ${error.message}`);
  }
  return { sessions: [] };
}

// data.jsonファイルを読み込み（手動）
async function loadDataJsonFile() {
  showDebugInfo(`=== data.json手動読み込み開始 ===`);

  try {
    // 汎用的なreadJsonFile関数を使用（ファイル選択あり）
    const data = await readJsonFile('data.json', 'data', false);
    
    if (!data) {
      showDebugInfo(`data.jsonファイルが見つかりませんでした`);
      throw new Error('data.jsonファイルの読み込みに失敗しました。');
    }
    
    // データ構造の検証
    if (!data.sessions || !Array.isArray(data.sessions)) {
      showDebugInfo(`エラー: sessionsプロパティが無効です`);
      showDebugInfo(`data構造: ${JSON.stringify(data, null, 2)}`);
      throw new Error('data.jsonファイルの構造が無効です。sessionsプロパティが配列ではありません。');
    }
    
    showDebugInfo(`セッション数: ${data.sessions.length}件`);
    if (data.sessions.length > 0) {
      showDebugInfo(`最初のセッション: ${JSON.stringify(data.sessions[0], null, 2)}`);
    }
    showDebugInfo(`=== data.json手動読み込み完了 ===`);
    
    // data.jsonのファイルハンドルを互換性のために保存
    if (fileHandles.data) {
      dataJsonFileHandle = fileHandles.data;
    }
    
    return data;
    
  } catch (error) {
    showDebugInfo(`data.json手動読み込みエラー: ${error.message}`);
    
    // エラーの詳細を分かりやすく表示
    let errorDetails = error.stack;
    if (errorDetails) {
      // 長いファイルパスを短縮
      errorDetails = errorDetails.replace(/file:\/\/\/[^\/]+(\/[^\/]+)*\//g, '');
      showDebugInfo(`エラーの詳細: ${errorDetails}`);
    }
    throw error;
  }
}

// data.jsonファイルを自動読み込み（ページ読み込み時）
async function autoLoadDataJson() {
  showDebugInfo(`=== data.json自動読み込み開始 ===`);
  
  try {
    // まずlocalStorageから読み込み
    showDebugInfo(`localStorageからセッション記録を読み込み中...`);
    const sessionData = loadSessionData();
    
    if (sessionData.sessions && sessionData.sessions.length > 0) {
      showDebugInfo(`localStorageからセッション記録を読み込み: ${sessionData.sessions.length}件`);
    } else {
      showDebugInfo(`localStorageにセッション記録がありません`);
    }
    
    // data.jsonを自動読み込み（プロトコルに関係なく）
    showDebugInfo(`data.jsonファイルの自動読み込みを試行します`);
    showDebugInfo(`プロトコル: ${window.location.protocol}`);
    
    // readJsonFileを使用（skipPicker=trueで自動読み込み）
    const data = await readJsonFile('data.json', 'data', true);
    
    if (data && data.sessions && Array.isArray(data.sessions)) {
      showDebugInfo(`data.jsonから読み込み成功: ${data.sessions.length}件のセッション`);
      
      // localStorageに保存
      saveSessionData(data);
      showDebugInfo(`localStorageに保存完了`);
      
      // data.jsonを読み込んだ後にXPを更新
      calculateAndUpdateXP();
      showDebugInfo(`XPを更新しました`);
      
      showDebugInfo(`data.jsonから自動読み込み完了: ${data.sessions.length}件のセッション`);
      return data;
    } else {
      showDebugInfo(`data.jsonが見つからないか空です: localStorageのデータを使用`);
      return sessionData;
    }
    
  } catch (error) {
    showDebugInfo(`data.json自動読み込みエラー: ${error.message}`);
    
    // エラーの詳細を分かりやすく表示
    let errorDetails = error.stack;
    if (errorDetails) {
      // 長いファイルパスを短縮
      errorDetails = errorDetails.replace(/file:\/\/\/[^\/]+(\/[^\/]+)*\//g, '');
      showDebugInfo(`エラーの詳細: ${errorDetails}`);
    }
    
    // エラー時はlocalStorageのデータを返す
    const sessionData = loadSessionData();
    return sessionData.sessions ? sessionData : { sessions: [] };
  }
}

// data.jsonファイルを自動保存（学習終了時）
async function autoSaveDataJson() {
  showDebugInfo(`=== data.json自動保存開始 ===`);
  
  try {
    // 新しい形式のdata.jsonを取得
    const dataJsonStr = localStorage.getItem('dataJson');
    if (!dataJsonStr) {
      showDebugInfo(`localStorageにdata.jsonデータがありません`);
      return;
    }
    
    const dataJson = JSON.parse(dataJsonStr);
    if (!dataJson.sessions || dataJson.sessions.length === 0) {
      showDebugInfo(`セッション記録が空のため、自動保存をスキップします`);
      return;
    }
    
    showDebugInfo(`セッション記録を自動保存: ${dataJson.sessions.length}件`);
    
    // 保存するデータの構造を整える
    const saveData = {
      version: "2.0",
      format: "array",
      lastUpdated: new Date().toISOString(),
      totalSessions: dataJson.sessions.length,
      sessions: dataJson.sessions
    };
    
    // デバッグモードの場合は詳細ログを出力
    if (debugMode) {
      showDebugInfo(`保存するデータ: ${dataJson.sessions.length}件のセッション`);
      showDebugInfo(`最新のセッション: ${JSON.stringify(dataJson.sessions[0])}`);
    }
    
    // プロトコルをチェック
    const protocol = window.location.protocol;
    showDebugInfo(`現在のプロトコル: ${protocol}`);
    
    // HTTPプロトコルの場合は既存ファイルに書き込み
    if (protocol === 'http:' || protocol === 'https:') {
      showDebugInfo(`HTTPプロトコル: 既存のdata.jsonファイルへの書き込みを試行します`);
      
      // まず既存のdata.jsonファイルの読み込みを試行
      let existingData = null;
      try {
        const response = await fetch('./data.json');
        if (response.ok) {
          const content = await response.text();
          existingData = JSON.parse(content);
          showDebugInfo(`既存のdata.jsonファイルを読み込みました: ${existingData.sessions?.length || 0}件のセッション`);
        }
      } catch (fetchError) {
        showDebugInfo(`既存のdata.jsonファイルが見つかりません: ${fetchError.message}`);
      }
      
      // 既存データとマージ
      if (existingData && existingData.sessions && Array.isArray(existingData.sessions)) {
        showDebugInfo(`既存データとマージします`);
        
        // 新しいセッションのみを追加（重複を避ける）
        const existingSessions = existingData.sessions;
        const newSessions = saveData.sessions.filter(newSession => {
          return !existingSessions.some(existing => 
            existing[0] === newSession[0] && existing[1] === newSession[1]
          );
        });
        
        showDebugInfo(`新しいセッション: ${newSessions.length}件`);
        
        // マージしたデータ
        saveData.sessions = [...existingSessions, ...newSessions];
        saveData.totalSessions = saveData.sessions.length;
        
        // タイムスタンプでソート（新しい順）
        saveData.sessions.sort((a, b) => {
          const timeA = a[0].split('.').map(Number);
          const timeB = b[0].split('.').map(Number);
          return new Date(timeB[0], timeB[1]-1, timeB[2], timeB[3], timeB[4], timeB[5]) - 
                 new Date(timeA[0], timeA[1]-1, timeA[2], timeA[3], timeA[4], timeA[5]);
        });
        
        showDebugInfo(`マージ後のセッション数: ${saveData.sessions.length}件`);
      }
      
      // File System Access APIを使用して保存
      try {
        if (!window.showSaveFilePicker) {
          throw new Error('File System Access APIがサポートされていません');
        }
        
        // 保存されたファイルハンドルがあればそれを使用、なければ新規作成
        let fileHandle = dataJsonFileHandle;
        
        if (!fileHandle) {
          showDebugInfo(`data.jsonファイルの選択ダイアログを表示します`);
          fileHandle = await window.showSaveFilePicker({
            id: 'dataJsonAuto',
            suggestedName: 'data.json',
            types: [{
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] }
            }]
          });
          
          // ファイルハンドルを保存
          dataJsonFileHandle = fileHandle;
          showDebugInfo(`data.jsonファイルハンドルを保存しました`);
        } else {
          showDebugInfo(`保存されたファイルハンドルを使用します`);
        }
        
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(saveData, null, 2));
        await writable.close();
        
        showDebugInfo(`data.jsonファイルに保存しました: ${fileHandle.name}`);
        
        // 成功メッセージを表示
        showDataJsonLoadMessage(`data.jsonに保存しました（${saveData.sessions.length}件のセッション）`);
      } catch (saveError) {
        if (saveError.name === 'AbortError') {
          showDebugInfo(`ファイル選択がキャンセルされました`);
        } else {
          showDebugInfo(`data.json保存エラー: ${saveError.message}`);
          // ファイルハンドルをクリア（次回は再度選択）
          dataJsonFileHandle = null;
        }
      }
    } else {
      // file://プロトコルの場合
      showDebugInfo(`file://プロトコル: 既存ファイルへの書き込みを試行します`);
      
      try {
        if (!window.showSaveFilePicker) {
          throw new Error('File System Access APIがサポートされていません');
        }
        
        // 保存されたファイルハンドルがあればそれを使用、なければ新規作成
        let fileHandle = dataJsonFileHandle;
        
        if (!fileHandle) {
          showDebugInfo(`data.jsonファイルの選択ダイアログを表示します（初回のみ）`);
          fileHandle = await window.showSaveFilePicker({
            id: 'dataJsonFile',
            suggestedName: 'data.json',
            types: [{
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] }
            }]
          });
          
          // ファイルハンドルを保存
          dataJsonFileHandle = fileHandle;
          showDebugInfo(`data.jsonファイルハンドルを保存しました: ${fileHandle.name}`);
        } else {
          showDebugInfo(`保存されたファイルハンドルを使用します: ${fileHandle.name}`);
        }
        
        // 既存のファイル内容を読み込んでマージ
        try {
          const file = await fileHandle.getFile();
          const content = await file.text();
          
          if (content && content.length > 0) {
            const existingData = JSON.parse(content);
            showDebugInfo(`既存のdata.jsonファイルを読み込みました: ${existingData.sessions?.length || 0}件のセッション`);
            
            // 既存データとマージ
            if (existingData.sessions && Array.isArray(existingData.sessions)) {
              const existingSessions = existingData.sessions;
              const newSessions = saveData.sessions.filter(newSession => {
                return !existingSessions.some(existing => 
                  existing[0] === newSession[0] && existing[1] === newSession[1]
                );
              });
              
              showDebugInfo(`新しいセッション: ${newSessions.length}件`);
              
              // マージしたデータ
              saveData.sessions = [...existingSessions, ...newSessions];
              saveData.totalSessions = saveData.sessions.length;
              
              // タイムスタンプでソート（新しい順）
              saveData.sessions.sort((a, b) => {
                const timeA = a[0].split('.').map(Number);
                const timeB = b[0].split('.').map(Number);
                return new Date(timeB[0], timeB[1]-1, timeB[2], timeB[3], timeB[4], timeB[5]) - 
                       new Date(timeA[0], timeA[1]-1, timeA[2], timeA[3], timeA[4], timeA[5]);
              });
              
              showDebugInfo(`マージ後のセッション数: ${saveData.sessions.length}件`);
            }
          }
        } catch (readError) {
          showDebugInfo(`既存ファイルの読み込みエラー（新規ファイルとして保存）: ${readError.message}`);
        }
        
        // ファイルに書き込み
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(saveData, null, 2));
        await writable.close();
        
        showDebugInfo(`data.jsonファイルに保存しました: ${fileHandle.name} (${saveData.sessions.length}件)`);
        
        // 成功メッセージを表示
        showDataJsonLoadMessage(`data.jsonに保存しました（${saveData.sessions.length}件のセッション）`);
      } catch (saveError) {
        if (saveError.name === 'AbortError') {
          showDebugInfo(`ファイル選択がキャンセルされました`);
        } else {
          showDebugInfo(`data.json保存エラー: ${saveError.message}`);
          // ファイルハンドルをクリア（次回は再度選択）
          dataJsonFileHandle = null;
        }
      }
    }
    
  } catch (error) {
    showDebugInfo(`data.json自動保存エラー: ${error.message}`);
  }
}

// セッション記録を保存
function saveSessionData(sessionData) {
  try {
    localStorage.setItem('sessionData', JSON.stringify(sessionData));
    showDebugInfo(`セッション記録を保存: ${sessionData.sessions.length}件`);
  } catch (error) {
    showDebugInfo(`セッション記録保存エラー: ${error.message}`);
  }
}

// 復習セッションを記録
function recordReviewSession(wordbookHash, wordbookTitle, startTime, endTime, questionCount, correctCount, wrongCount) {
  const sessionData = loadSessionData();
  
  showDebugInfo(`=== 復習セッション記録開始 ===`);
  showDebugInfo(`単語帳: ${wordbookTitle}`);
  showDebugInfo(`startTime: ${startTime} (${typeof startTime})`);
  showDebugInfo(`endTime: ${endTime} (${typeof endTime})`);
  
  // startTimeとendTimeがタイムスタンプ（数値）の場合はDateオブジェクトに変換
  const startTimeDate = typeof startTime === 'number' ? new Date(startTime) : startTime;
  const endTimeDate = typeof endTime === 'number' ? new Date(endTime) : endTime;
  
  // 日本標準時（JST）でタイムスタンプを生成
  const jstOffset = 9 * 60; // JSTはUTC+9
  const jstStartTime = new Date(startTimeDate.getTime() + (jstOffset * 60 * 1000));
  const jstEndTime = new Date(endTimeDate.getTime() + (jstOffset * 60 * 1000));
  
  // 新しい形式のセッション記録を作成
  const duration = endTime - startTime; // ミリ秒
  const durationMinutes = Math.round(duration / 1000 / 60); // 分単位
  
  // 平均回答速度を計算（秒/問）
  const averageAnswerSpeed = questionCount > 0 ? Math.round((duration / 1000) / questionCount) : 0;
  
  // 新しい単語と復習単語の数を計算
  // 現在の進捗データから正確に計算
  const currentProgress = progressData || {};
  let newWords = 0;
  let reviewWords = 0;
  
  Object.values(currentProgress).forEach(wordProgress => {
    if (wordProgress.history && wordProgress.history.length > 0) {
      // 履歴がある場合は復習単語
      reviewWords++;
    } else {
      // 履歴がない場合は新しい単語
      newWords++;
    }
  });
  
  // 進捗データにない単語は新しい単語として扱う
  const totalWords = allWords ? allWords.length : questionCount;
  const processedWords = Object.keys(currentProgress).length;
  newWords += Math.max(0, totalWords - processedWords);
  
  // 平均評価を計算（hard=1.5, again=1.2, normal=1.0, easy=0.8）
  let totalGradeScore = 0;
  let gradeCount = 0;
  
  // 現在の進捗データから評価を取得
  Object.values(currentProgress).forEach(wordProgress => {
    if (wordProgress.history && wordProgress.history.length > 0) {
      const lastHistory = wordProgress.history[wordProgress.history.length - 1];
      if (lastHistory.grade) {
        let gradeScore = 0;
        switch (lastHistory.grade) {
          case 'hard': gradeScore = 1.5; break;
          case 'again': gradeScore = 1.2; break;
          case 'normal': gradeScore = 1.0; break;
          case 'easy': gradeScore = 0.8; break;
        }
        totalGradeScore += gradeScore;
        gradeCount++;
      }
    }
  });
  
  const averageGrade = gradeCount > 0 ? (totalGradeScore / gradeCount).toFixed(2) : 0;
  
  // 追加XPを計算（既存のXP計算ロジックを使用）
  const xpGained = calculateXPGain(questionCount, correctCount, wrongCount);
  
  // 新しい形式のセッション記録
  const sessionRecord = [
    `${jstStartTime.getFullYear()}.${(jstStartTime.getMonth() + 1).toString().padStart(2, '0')}.${jstStartTime.getDate().toString().padStart(2, '0')}.${jstStartTime.getHours().toString().padStart(2, '0')}.${jstStartTime.getMinutes().toString().padStart(2, '0')}.${jstStartTime.getSeconds().toString().padStart(2, '0')}`,
    wordbookTitle,
    durationMinutes,
    xpGained,
    averageAnswerSpeed,
    newWords,
    reviewWords,
    averageGrade
  ];
  
  // 既存のセッション記録を読み込み
  let dataJson = { sessions: [] };
  try {
    const existingData = localStorage.getItem('dataJson');
    if (existingData) {
      dataJson = JSON.parse(existingData);
    }
  } catch (e) {
    showDebugInfo(`既存のdata.json読み込みエラー: ${e.message}`);
  }
  
  // 新しいセッション記録を追加
  dataJson.sessions = dataJson.sessions || [];
  dataJson.sessions.push(sessionRecord);
  
  // 最新のセッションを最初に配置
  dataJson.sessions.sort((a, b) => {
    const timeA = a[0].split('.').map(Number);
    const timeB = b[0].split('.').map(Number);
    return new Date(timeB[0], timeB[1]-1, timeB[2], timeB[3], timeB[4], timeB[5]) - 
           new Date(timeA[0], timeA[1]-1, timeA[2], timeA[3], timeA[4], timeA[5]);
  });
  
  // 最大1000件まで保持
  if (dataJson.sessions.length > 1000) {
    dataJson.sessions = dataJson.sessions.slice(0, 1000);
  }
  
  // localStorageに保存
  localStorage.setItem('dataJson', JSON.stringify(dataJson));
  
  // 従来の形式も保持（互換性のため）
  const session = {
    id: Date.now().toString(),
    wordbookHash: wordbookHash,
    wordbookTitle: wordbookTitle,
    startTime: jstStartTime.toISOString().replace('Z', '+09:00'),
    endTime: jstEndTime.toISOString().replace('Z', '+09:00'),
    duration: duration,
    questionCount: questionCount,
    correctCount: correctCount,
    wrongCount: wrongCount,
    accuracy: questionCount > 0 ? (correctCount / questionCount * 100).toFixed(1) : 0,
    date: jstStartTime.toISOString().split('T')[0],
    time: jstStartTime.toTimeString().split(' ')[0],
    timestamp: jstStartTime.getTime()
  };
  
  sessionData.sessions = sessionData.sessions || [];
  sessionData.sessions.push(session);
  sessionData.sessions.sort((a, b) => b.timestamp - a.timestamp);
  
  if (sessionData.sessions.length > 1000) {
    sessionData.sessions = sessionData.sessions.slice(0, 1000);
  }
  
  saveSessionData(sessionData);
  
  showDebugInfo(`復習セッションを記録: ${wordbookTitle} (${questionCount}問, 正解${correctCount}問, 間違い${wrongCount}問)`);
  showDebugInfo(`新しい形式の記録: ${JSON.stringify(sessionRecord)}`);
  
  return session;
}

// XP獲得量を計算する関数
function calculateXPGain(questionCount, correctCount, wrongCount) {
  if (questionCount === 0) return 0;
  
  const correctRate = correctCount / questionCount;
  const baseXP = questionCount * 10; // 基本XP
  const bonusXP = correctRate > 0.8 ? questionCount * 5 : 0; // 正解率80%以上でボーナス
  const penaltyXP = wrongCount * 2; // 間違いペナルティ
  
  return Math.max(0, baseXP + bonusXP - penaltyXP);
}

// data.jsonにセッション記録を保存
function saveSessionToDataJson(sessionData) {
  try {
    // 新しい形式のdata.jsonを保存
    const dataJson = localStorage.getItem('dataJson');
    if (dataJson) {
      // 既存の新しい形式のデータをそのまま使用
      const parsedData = JSON.parse(dataJson);
      saveDataJsonFile(parsedData);
      showDebugInfo(`data.jsonにセッション記録を保存: 新しい形式のデータを使用`);
    } else {
      // 従来の形式から新しい形式に変換
      const newFormatSessions = [];
      if (sessionData.sessions && sessionData.sessions.length > 0) {
        sessionData.sessions.forEach(session => {
          const startTime = new Date(session.startTime);
          const duration = session.duration;
          const durationMinutes = Math.round(duration / 1000 / 60);
          const averageAnswerSpeed = session.questionCount > 0 ? Math.round((duration / 1000) / session.questionCount) : 0;
          const newWords = 0; // 従来のデータからは計算できない
          const reviewWords = session.questionCount;
          const averageGrade = 1.0; // デフォルト値
          const xpGained = calculateXPGain(session.questionCount, session.correctCount, session.wrongCount);
          
          const sessionRecord = [
            `${startTime.getFullYear()}.${(startTime.getMonth() + 1).toString().padStart(2, '0')}.${startTime.getDate().toString().padStart(2, '0')}.${startTime.getHours().toString().padStart(2, '0')}.${startTime.getMinutes().toString().padStart(2, '0')}.${startTime.getSeconds().toString().padStart(2, '0')}`,
            session.wordbookTitle,
            durationMinutes,
            xpGained,
            averageAnswerSpeed,
            newWords,
            reviewWords,
            averageGrade
          ];
          
          newFormatSessions.push(sessionRecord);
        });
      }
      
      const newDataJson = {
        version: "2.0",
        format: "new",
        sessions: newFormatSessions
      };
      
      saveDataJsonFile(newDataJson);
      showDebugInfo(`data.jsonにセッション記録を保存: ${newFormatSessions.length}件（新しい形式に変換）`);
    }
  } catch (error) {
    showDebugInfo(`data.json保存エラー: ${error.message}`);
  }
}

// data.jsonファイルを保存
async function saveDataJsonFile(data) {
  try {
    const dataStr = JSON.stringify(data, null, 2);
    const fileName = 'data.json';
    
    // File System Access APIを使用してファイルを保存
    const fileHandle = await window.showSaveFilePicker({
      id: 'dataJson',
      suggestedName: fileName,
      types: [{
        description: 'JSON Files',
        accept: { 'application/json': ['.json'] }
      }]
    });
    
    const writable = await fileHandle.createWritable();
    await writable.write(dataStr);
    await writable.close();
    
    showDebugInfo(`data.jsonファイルを保存しました: ${fileName}`);
  } catch (error) {
    showDebugInfo(`data.jsonファイル保存エラー: ${error.message}`);
    
    // フォールバック: ダウンロードリンクで保存
    downloadDataJsonFile(data);
  }
}

// data.jsonファイルをダウンロードする関数
function downloadDataJsonFile(data) {
  // 既存のリンクがあれば削除
  const existingLink = document.getElementById('dataJsonSaveLink');
  if (existingLink) {
    existingLink.remove();
  }
  
  // ダウンロードリンクを作成
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  const link = document.createElement('a');
  link.id = 'dataJsonSaveLink';
  link.href = URL.createObjectURL(dataBlob);
  link.download = 'data.json';
  link.textContent = 'data.jsonをダウンロード';
  link.style.display = 'inline-block';
  link.style.padding = '10px 20px';
  link.style.background = '#27ae60';
  link.style.color = 'white';
  link.style.textDecoration = 'none';
  link.style.borderRadius = '5px';
  link.style.margin = '10px';
  link.style.fontWeight = 'bold';
  
  // 説明テキストを追加
  const description = document.createElement('div');
  description.textContent = `復習セッション記録を保存するために、このファイルをダウンロードしてください。`;
  description.style.margin = '10px';
  description.style.color = '#666';
  description.style.fontSize = '14px';
  
  // ページに表示
  const container = document.getElementById('menuScreen') || document.body;
  container.appendChild(description);
  container.appendChild(link);
  
  showDebugInfo(`data.jsonファイルのダウンロードリンクを表示しました`);
  
  // 自動ダウンロードを試行（ユーザーが許可した場合）
  setTimeout(() => {
    try {
      link.click();
      showDebugInfo(`data.jsonの自動ダウンロードを実行しました`);
    } catch (error) {
      showDebugInfo(`data.jsonの自動ダウンロードに失敗: ${error.message}`);
    }
  }, 1000);
}

// 結果画面の表示/非表示制御と内容生成
async function showResultScreen() {
  showDebugInfo('=== 結果画面表示開始 ===');
  
  // セッション時間の確認
  showDebugInfo(`sessionStartTime: ${sessionStartTime}`);
  showDebugInfo(`sessionEndTime: ${sessionEndTime}`);
  
  // 結果画面の要素が存在するかチェック
  const resultScreen = document.getElementById('resultScreen');
  const resultSummaryElement = document.getElementById('resultSummary');
  const resultDetailsElement = document.getElementById('resultDetails');
  
  showDebugInfo(`resultScreen要素: ${!!resultScreen}`);
  showDebugInfo(`resultSummary要素: ${!!resultSummaryElement}`);
  showDebugInfo(`resultDetails要素: ${!!resultDetailsElement}`);
  
  if (!resultScreen) {
    showDebugInfo('エラー: resultScreen要素が見つかりません');
    alert('結果画面の表示に失敗しました');
    return;
  }
  
  if (!resultSummaryElement || !resultDetailsElement) {
    showDebugInfo('エラー: 結果画面の子要素が見つかりません');
    alert('結果画面の表示に失敗しました（子要素がありません）');
    return;
  }
  
  showDebugInfo('結果画面要素を確認: ' + resultScreen.id);
  
  // main/menu/結果画面の切り替え
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('bottomBar').style.display = 'none';
  document.getElementById('menuScreen').style.display = 'none';
  document.getElementById('progressBar').style.display = 'none';
  document.getElementById('statusText').style.display = 'none';
  
  // 上部バーのボタンを非表示
  const fileInputLabel = document.getElementById('fileInputLabel');
  const backToMenuBtn = document.getElementById('backToMenuBtn');
  const globalStatsBtn = document.getElementById('globalStatsBtn');
  const floatingNewBtn = document.getElementById('floatingNewBtn');
  
  if (fileInputLabel) fileInputLabel.style.display = 'none';
  if (backToMenuBtn) backToMenuBtn.style.display = 'none';
  if (globalStatsBtn) globalStatsBtn.style.display = 'none';
  if (floatingNewBtn) floatingNewBtn.style.display = 'none';
  
  resultScreen.style.display = 'block';
  
  showDebugInfo('画面切り替え完了: 結果画面を表示');
  showDebugInfo(`resultScreen.style.display = ${resultScreen.style.display}`);
  
  // 学習セッション時間を履歴に保存
  const currentHash = getCurrentWordbookHash();
  showDebugInfo(`currentHash: ${currentHash}`);
  
  // sessionEndTimeが設定されていない場合は現在時刻を使用
  if (!sessionEndTime) {
    sessionEndTime = Date.now();
    showDebugInfo(`sessionEndTimeが未設定のため現在時刻を使用: ${sessionEndTime}`);
  }
  
  if (currentHash && sessionStartTime && sessionEndTime) {
    showDebugInfo(`セッション記録条件を満たしています`);
    
    let history = await getHistoryList();
    const entryIndex = history.findIndex(e => e.hash === currentHash);
    showDebugInfo(`履歴エントリインデックス: ${entryIndex}`);
    
    if (entryIndex > -1) {
      history[entryIndex].sessionStartTime = sessionStartTime;
      history[entryIndex].sessionEndTime = sessionEndTime;
      await setHistoryList(history);
      showDebugInfo(`学習セッション時間を保存: ${currentHash}`);
    } else {
      showDebugInfo(`警告: 履歴エントリが見つかりません`);
    }
    
    // 復習セッションを記録
    const wordbookTitle = history[entryIndex]?.title || 'Unknown';
    const totalQuestions = newWordCount + reviewWordCount;
    const wrongCount = wrongList.length;
    
    showDebugInfo(`セッション記録パラメータ:`);
    showDebugInfo(`  単語帳: ${wordbookTitle}`);
    showDebugInfo(`  問題数: ${totalQuestions}`);
    showDebugInfo(`  正解数: ${correctCount}`);
    showDebugInfo(`  間違い数: ${wrongCount}`);
    
    recordReviewSession(
      currentHash,
      wordbookTitle,
      sessionStartTime,
      sessionEndTime,
      totalQuestions,
      correctCount,
      wrongCount
    );
    
    // XPを更新（セッション記録後）
    calculateAndUpdateXP();
    showDebugInfo(`セッション終了後にXPを更新しました`);
    
    // data.jsonの自動保存
    autoSaveDataJson();
  } else {
    showDebugInfo(`警告: セッション記録条件を満たしていません`);
    showDebugInfo(`  currentHash: ${currentHash}`);
    showDebugInfo(`  sessionStartTime: ${sessionStartTime}`);
    showDebugInfo(`  sessionEndTime: ${sessionEndTime}`);
  }
  
  // 結果集計
  let totalTime = sessionEndTime && sessionStartTime ? Math.round((sessionEndTime-sessionStartTime)/1000) : 0;
  
  showDebugInfo(`結果集計開始: 総時間=${totalTime}秒, 問題数=${questionTimes.length}`);
  
  // 最も時間がかかった問題
  let slowest = questionTimes.length > 0 ? questionTimes.reduce((a,b)=>a.time>b.time?a:b) : null;
  
  // その一回での間違い回数（累積ではなく、その問題で何回間違えたか）
  let wrongCountMap = {};
  // 実際に学習した単語のみを対象とする
  let learnedWords = new Set();
  
  // quizQueueから学習した単語を取得
  if (quizQueue && quizQueue.length > 0) {
    quizQueue.forEach(word => {
      learnedWords.add(word.question);
    });
  }
  
  showDebugInfo(`学習した単語数: ${learnedWords.size}`);
  showDebugInfo(`学習した単語: ${Array.from(learnedWords).join(', ')}`);
  
  // セッション間違い数を使用
  for (const word of allWords) {
    // 学習していない単語はスキップ
    if (!learnedWords.has(word.question)) {
      continue;
    }
    
    // セッション間違い数を使用（累積履歴ではなく）
    const sessionWrongCount = sessionWrongCounts[word.question] || 0;
    wrongCountMap[word.question] = sessionWrongCount;
    
    showDebugInfo(`単語: ${word.question}, セッション間違い数: ${sessionWrongCount}`);
  }
  
  // 最も間違えた問題
  let mostWrong = Object.entries(wrongCountMap).sort((a,b)=>b[1]-a[1])[0];
  
  showDebugInfo(`セッション間違い数マップ: ${JSON.stringify(wrongCountMap)}`);
  showDebugInfo(`最も間違えた問題: ${mostWrong ? mostWrong[0] + ' (' + mostWrong[1] + '回)' : 'なし'}`);
  
  // サマリー
  let summary = `<div>学習時間: ${totalTime}秒</div>`;
  summary += `<div>問題数: ${newWordCount + reviewWordCount}問</div>`;
  summary += `<div>正解数: ${correctCount}問</div>`;
  summary += `<div>間違い数: ${wrongList.length}問</div>`;
  if (slowest) summary += `<div>最も回答に時間がかかった問題: ${slowest.question}（${Math.round(slowest.time/1000)}秒）</div>`;
  if (mostWrong && mostWrong[1]>0) summary += `<div>一回のセッションで最も間違えた問題: ${mostWrong[0]}（${mostWrong[1]}回）</div>`;
  
  showDebugInfo(`サマリー内容: ${summary}`);
  
  const resultSummary = document.getElementById('resultSummary');
  if (resultSummary) {
    resultSummary.innerHTML = summary;
    showDebugInfo(`結果サマリーを表示: ${summary.length}文字`);
    showDebugInfo(`resultSummary.innerHTML = ${resultSummary.innerHTML.substring(0, 100)}...`);
  } else {
    showDebugInfo('エラー: resultSummary要素が見つかりません');
  }
  
  // 詳細表（一つの単語につき一行、最も時間がかかったものを表示）
  let wordTimeMap = {};
  questionTimes.forEach(qt => {
    if (!wordTimeMap[qt.question] || wordTimeMap[qt.question].time < qt.time) {
      wordTimeMap[qt.question] = qt;
    }
  });
  
  showDebugInfo(`詳細表の生成開始: 学習した単語数=${learnedWords.size}`);
  
  let details = '<table class="stats-table"><tr><th>問題</th><th>回答所要時間(秒)</th><th>一回のセッションでの間違い数</th></tr>';
  let rowCount = 0;
  
  // 実際に学習した単語のみについて結果を表示
  Array.from(learnedWords).forEach(wordQuestion => {
    // 単語オブジェクトを取得
    const word = allWords.find(w => w.question === wordQuestion);
    if (!word) {
      showDebugInfo(`警告: 単語が見つかりません: ${wordQuestion}`);
      return;
    }
    
    const questionTime = wordTimeMap[word.question];
    const timeDisplay = questionTime ? Math.round(questionTime.time/1000) : '-';
    const wrongCount = wrongCountMap[word.question] || 0;
    
    details += `<tr><td>${word.question}</td><td>${timeDisplay}</td><td>${wrongCount}</td></tr>`;
    rowCount++;
  });
  
  details += '</table>';
  
  showDebugInfo(`詳細表の生成完了: ${rowCount}行, HTMLサイズ=${details.length}文字`);
  
  const resultDetails = document.getElementById('resultDetails');
  if (resultDetails) {
    resultDetails.innerHTML = details;
    showDebugInfo(`結果詳細表を表示: ${rowCount}行`);
    showDebugInfo(`resultDetails.innerHTML = ${resultDetails.innerHTML.substring(0, 100)}...`);
  } else {
    showDebugInfo('エラー: resultDetails要素が見つかりません');
  }
  
  showDebugInfo(`=== 結果画面表示完了 ===`);
  showDebugInfo(`総時間: ${totalTime}秒`);
  showDebugInfo(`記録された問題数: ${questionTimes.length}`);
  showDebugInfo(`学習した単語数: ${learnedWords.size}`);
  showDebugInfo(`総単語数: ${allWords.length}`);
  showDebugInfo(`表示された行数: ${rowCount}`);
  
  // 結果グラフを描画
  drawResultGraphs(learnedWords, wordTimeMap, wrongCountMap);
}

// 結果グラフを描画する関数
function drawResultGraphs(learnedWords, wordTimeMap, wrongCountMap) {
  showDebugInfo(`=== 結果グラフ描画開始 ===`);
  
  // 各単語の一回目の回答難易度を取得
  let firstAttemptGrades = [];
  let answerTimes = [];
  let accuracyData = [];
  
  Array.from(learnedWords).forEach(wordQuestion => {
    const word = allWords.find(w => w.question === wordQuestion);
    if (!word) return;
    
    // 回答時間
    const questionTime = wordTimeMap[word.question];
    if (questionTime) {
      answerTimes.push({
        question: word.question,
        time: Math.round(questionTime.time / 1000) // 秒単位
      });
    }
    
    // 正解率（セッション内での間違い回数から計算）
    const wrongCount = wrongCountMap[word.question] || 0;
    // その単語がquizQueueに何回出現したか（1回目 + 間違えた回数）
    const totalAttempts = 1 + wrongCount;
    const correctAttempts = 1; // 最終的には正解した
    const accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts * 100) : 0;
    
    accuracyData.push({
      question: word.question,
      accuracy: accuracy,
      wrongCount: wrongCount
    });
    
    // 一回目の回答難易度を取得
    const progress = progressData[word.question];
    if (progress && progress.history && progress.history.length > 0) {
      // このセッションで最初に回答した時の評価を取得
      // セッション開始時刻以降の最初の履歴を探す
      const sessionStart = sessionStartTime || 0;
      const firstSessionAttempt = progress.history.find(h => h.timestamp >= sessionStart);
      
      if (firstSessionAttempt) {
        const gradeValue = convertGradeToValue(firstSessionAttempt.grade);
        firstAttemptGrades.push({
          question: word.question,
          grade: firstSessionAttempt.grade,
          value: gradeValue
        });
      }
    }
  });
  
  showDebugInfo(`回答時間データ: ${answerTimes.length}件`);
  showDebugInfo(`正解率データ: ${accuracyData.length}件`);
  showDebugInfo(`一回目難易度データ: ${firstAttemptGrades.length}件`);
  
  // 平均回答時間を計算
  const totalTime = answerTimes.reduce((sum, item) => sum + item.time, 0);
  const averageTime = answerTimes.length > 0 ? (totalTime / answerTimes.length).toFixed(1) : 0;
  
  // 平均正解率を計算
  const totalAccuracy = accuracyData.reduce((sum, item) => sum + item.accuracy, 0);
  const averageAccuracy = accuracyData.length > 0 ? (totalAccuracy / accuracyData.length).toFixed(1) : 0;
  
  // 平均難易度を計算
  const totalDifficulty = firstAttemptGrades.reduce((sum, item) => sum + item.value, 0);
  const averageDifficulty = firstAttemptGrades.length > 0 ? (totalDifficulty / firstAttemptGrades.length).toFixed(2) : 0;
  
  showDebugInfo(`平均回答時間: ${averageTime}秒`);
  showDebugInfo(`平均正解率: ${averageAccuracy}%`);
  showDebugInfo(`平均難易度: ${averageDifficulty}`);
  
  // グラフ描画を遅延実行
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        // 1. 平均回答時間グラフ（バーチャート）
        const timeChartCanvas = document.getElementById('resultAverageTimeChart');
        if (!timeChartCanvas) {
          showDebugInfo('エラー: resultAverageTimeChart要素が見つかりません');
          return;
        }
        
        showDebugInfo(`平均回答時間グラフを描画中...`);
        
        const timeCtx = timeChartCanvas.getContext('2d');
        if (window.resultAverageTimeChartInstance) window.resultAverageTimeChartInstance.destroy();
        
        // データを回答時間順にソート（上位10件）
        const topSlowWords = answerTimes.sort((a, b) => b.time - a.time).slice(0, 10);
        
        window.resultAverageTimeChartInstance = new Chart(timeCtx, {
          type: 'bar',
          data: {
            labels: topSlowWords.map(item => item.question),
            datasets: [{
              label: '回答時間（秒）',
              data: topSlowWords.map(item => item.time),
              backgroundColor: 'rgba(52, 152, 219, 0.6)',
              borderColor: 'rgba(52, 152, 219, 1)',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              title: { 
                display: true, 
                text: `平均: ${averageTime}秒`,
                font: { size: 16, weight: 'bold' },
                color: '#3498db'
              }
            },
            scales: {
              y: { 
                beginAtZero: true,
                title: {
                  display: true,
                  text: '秒'
                }
              },
              x: {
                ticks: {
                  maxRotation: 45,
                  minRotation: 45
                }
              }
            }
          }
        });
        
        showDebugInfo('平均回答時間グラフ描画完了');
        
        // 2. 平均正解率グラフ（ドーナツチャート）
        const accuracyChartCanvas = document.getElementById('resultAccuracyChart');
        if (!accuracyChartCanvas) {
          showDebugInfo('エラー: resultAccuracyChart要素が見つかりません');
          return;
        }
        
        showDebugInfo(`平均正解率グラフを描画中...`);
        
        const accuracyCtx = accuracyChartCanvas.getContext('2d');
        if (window.resultAccuracyChartInstance) window.resultAccuracyChartInstance.destroy();
        
        // 正解率のカテゴリ分け
        const excellentCount = accuracyData.filter(item => item.accuracy === 100).length;
        const goodCount = accuracyData.filter(item => item.accuracy >= 50 && item.accuracy < 100).length;
        const needsWorkCount = accuracyData.filter(item => item.accuracy > 0 && item.accuracy < 50).length;
        const failedCount = accuracyData.filter(item => item.accuracy === 0).length;
        
        window.resultAccuracyChartInstance = new Chart(accuracyCtx, {
          type: 'doughnut',
          data: {
            labels: ['完璧 (100%)', '良好 (50-99%)', '要復習 (1-49%)', '不正解 (0%)'],
            datasets: [{
              data: [excellentCount, goodCount, needsWorkCount, failedCount],
              backgroundColor: [
                'rgba(46, 204, 113, 0.8)',
                'rgba(52, 152, 219, 0.8)',
                'rgba(241, 196, 15, 0.8)',
                'rgba(231, 76, 60, 0.8)'
              ],
              borderColor: [
                'rgba(46, 204, 113, 1)',
                'rgba(52, 152, 219, 1)',
                'rgba(241, 196, 15, 1)',
                'rgba(231, 76, 60, 1)'
              ],
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { position: 'bottom' },
              title: {
                display: true,
                text: `平均正解率: ${averageAccuracy}%`,
                font: { size: 16, weight: 'bold' },
                color: '#27ae60'
              }
            }
          }
        });
        
        showDebugInfo('平均正解率グラフ描画完了');
        
        // 3. 平均回答難易度グラフ（バーチャート）
        const difficultyChartCanvas = document.getElementById('resultDifficultyChart');
        if (!difficultyChartCanvas) {
          showDebugInfo('エラー: resultDifficultyChart要素が見つかりません');
          return;
        }
        
        showDebugInfo(`平均回答難易度グラフを描画中...`);
        
        const difficultyCtx = difficultyChartCanvas.getContext('2d');
        if (window.resultDifficultyChartInstance) window.resultDifficultyChartInstance.destroy();
        
        // 難易度別にカウント
        const easyCount = firstAttemptGrades.filter(item => item.grade === 'easy').length;
        const normalCount = firstAttemptGrades.filter(item => item.grade === 'normal').length;
        const againCount = firstAttemptGrades.filter(item => item.grade === 'again').length;
        const hardCount = firstAttemptGrades.filter(item => item.grade === 'hard').length;
        
        // 難易度の分布を表示
        window.resultDifficultyChartInstance = new Chart(difficultyCtx, {
          type: 'bar',
          data: {
            labels: ['簡単', '普通', 'もう一度', '難しい'],
            datasets: [{
              label: '問題数',
              data: [easyCount, normalCount, againCount, hardCount],
              backgroundColor: [
                'rgba(46, 204, 113, 0.6)',
                'rgba(52, 152, 219, 0.6)',
                'rgba(241, 196, 15, 0.6)',
                'rgba(231, 76, 60, 0.6)'
              ],
              borderColor: [
                'rgba(46, 204, 113, 1)',
                'rgba(52, 152, 219, 1)',
                'rgba(241, 196, 15, 1)',
                'rgba(231, 76, 60, 1)'
              ],
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              title: {
                display: true,
                text: `平均難易度: ${averageDifficulty} (easy=0.8, normal=1.0, again=1.2, hard=1.5)`,
                font: { size: 14, weight: 'bold' },
                color: '#e74c3c'
              }
            },
            scales: {
              y: { 
                beginAtZero: true,
                title: {
                  display: true,
                  text: '問題数'
                },
                ticks: {
                  stepSize: 1
                }
              }
            }
          }
        });
        
        showDebugInfo('平均回答難易度グラフ描画完了');
        showDebugInfo(`=== 結果グラフ描画完了 ===`);
        
      } catch (error) {
        showDebugInfo(`結果グラフ描画エラー: ${error.message}`);
        showDebugInfo(`エラー詳細: ${error.stack}`);
      }
    }, 100);
  });
}

// 難易度を数値に変換する関数
function convertGradeToValue(grade) {
  switch (grade) {
    case 'easy': return 0.8;
    case 'normal': return 1.0;
    case 'again': return 1.2;
    case 'hard': return 1.5;
    default: return 1.0;
  }
}

// 結果画面からメニューに戻る
document.getElementById('resultToMenuBtn').onclick = async function() {
  hideResultScreen();
  await showMenuScreen();
};

function hideResultScreen() {
  const resultScreen = document.getElementById('resultScreen');
  if (resultScreen) {
    resultScreen.style.display = 'none';
    showDebugInfo('結果画面を非表示にしました');
  }
  
  // 結果グラフのインスタンスを破棄
  if (window.resultAverageTimeChartInstance) {
    window.resultAverageTimeChartInstance.destroy();
    window.resultAverageTimeChartInstance = null;
    showDebugInfo('平均回答時間グラフインスタンスを破棄');
  }
  
  if (window.resultAccuracyChartInstance) {
    window.resultAccuracyChartInstance.destroy();
    window.resultAccuracyChartInstance = null;
    showDebugInfo('平均正解率グラフインスタンスを破棄');
  }
  
  if (window.resultDifficultyChartInstance) {
    window.resultDifficultyChartInstance.destroy();
    window.resultDifficultyChartInstance = null;
    showDebugInfo('平均回答難易度グラフインスタンスを破棄');
  }
  
  // 結果画面の内容をクリア
  const resultSummary = document.getElementById('resultSummary');
  const resultDetails = document.getElementById('resultDetails');
  if (resultSummary) resultSummary.innerHTML = '';
  if (resultDetails) resultDetails.innerHTML = '';
}

function showDeleteConfirmPopup() {
  const deleteConfirmPopup = document.getElementById('deleteConfirmPopup');
  if (deleteConfirmPopup) {
    deleteConfirmPopup.style.display = 'flex';
  }
}

// 間違えた単語リストを優先度順にソートする関数
function sortWrongListByPriority() {
  wrongList.sort((a, b) => {
    const priorityA = calculateWordPriority(a);
    const priorityB = calculateWordPriority(b);
    return priorityB - priorityA; // 優先度の高い順
  });
  
  showDebugInfo(`間違いリストを優先度順にソート: ${wrongList.map(w => w.question).join(', ')}`);
}

// 統計ポップアップの表示状況を確認するデバッグ関数
window.debugStatsPopup = function() {
  const statsPopup = document.getElementById('statsPopup');
  const statsContent = document.getElementById('statsContent');
  const globalStatsPopup = document.getElementById('globalStatsPopup');
  const globalReviewChart = document.getElementById('globalReviewChart');
  const globalRetentionPieChart = document.getElementById('globalRetentionPieChart');
  
  console.log('=== 統計ポップアップ要素の確認 ===');
  console.log('statsPopup:', statsPopup);
  console.log('statsContent:', statsContent);
  console.log('globalStatsPopup:', globalStatsPopup);
  console.log('globalReviewChart:', globalReviewChart);
  console.log('globalRetentionPieChart:', globalRetentionPieChart);
  
  if (statsPopup) {
    console.log('statsPopup.style.display:', statsPopup.style.display);
    console.log('statsPopup.offsetWidth:', statsPopup.offsetWidth);
    console.log('statsPopup.offsetHeight:', statsPopup.offsetHeight);
  }
  
  if (statsContent) {
    console.log('statsContent.innerHTML.length:', statsContent.innerHTML.length);
    console.log('statsContent.innerHTML.substring(0, 200):', statsContent.innerHTML.substring(0, 200));
  }
  
  if (globalStatsPopup) {
    console.log('globalStatsPopup.style.display:', globalStatsPopup.style.display);
  }
  
  return {
    statsPopup: !!statsPopup,
    statsContent: !!statsContent,
    globalStatsPopup: !!globalStatsPopup,
    globalReviewChart: !!globalReviewChart,
    globalRetentionPieChart: !!globalRetentionPieChart
  };
};

// 統計ポップアップを強制的に表示するデバッグ関数
window.forceShowStatsPopup = function() {
  const statsPopup = document.getElementById('statsPopup');
  if (statsPopup) {
    statsPopup.style.display = 'flex';
    console.log('統計ポップアップを強制表示しました');
    return true;
  } else {
    console.log('統計ポップアップ要素が見つかりません');
    return false;
  }
};

// 全体統計ポップアップを強制的に表示するデバッグ関数
window.forceShowGlobalStatsPopup = function() {
  const globalStatsPopup = document.getElementById('globalStatsPopup');
  if (globalStatsPopup) {
    globalStatsPopup.style.display = 'flex';
    console.log('全体統計ポップアップを強制表示しました');
    return true;
  } else {
    console.log('全体統計ポップアップ要素が見つかりません');
    return false;
  }
};

// 進捗表示のテスト用デバッグ関数
window.debugProgress = function() {
  console.log('=== 進捗状況デバッグ ===');
  console.log(`総単語数: ${allWords.length}`);
  console.log(`クイズキュー数: ${quizQueue.length}`);
  console.log(`現在のインデックス: ${currentIndex}`);
  console.log(`正解数: ${correctCount}`);
  console.log(`間違いリスト数: ${wrongList.length}`);
  console.log(`間違いリスト: ${wrongList.map(w => w.question).join(', ')}`);
  console.log(`新出単語数: ${newWordCount}`);
  console.log(`復習単語数: ${reviewWordCount}`);
  
  if (quizQueue.length > 0) {
    console.log('クイズキュー詳細:');
    quizQueue.forEach((word, index) => {
      const isCurrent = index === currentIndex;
      const isWrong = wrongList.includes(word);
      const isNew = !progressData[word.question];
      const isReview = progressData[word.question];
      
      console.log(`  ${index + 1}. ${word.question}${isCurrent ? ' [現在]' : ''}${isWrong ? ' [間違い]' : ''}${isNew ? ' [新出]' : ''}${isReview ? ' [復習]' : ''}`);
    });
  }
  
  // 進捗バーを強制更新
  updateProgressBar();
  console.log('進捗バーを更新しました');
};

// 優先度のテスト用デバッグ関数
window.debugPriority = function() {
  console.log('=== 優先度システム デバッグ ===');
  console.log('優先度の範囲:');
  console.log('- easy: ~0.5');
  console.log('- normal: 0.5~1.0');
  console.log('- again: 1.0~1.2');
  console.log('- hard: 1.2~');
  console.log('');
  console.log('新出単語の優先度: 1.0');
  console.log('');
  
  if (allWords.length > 0) {
    console.log('=== 全単語の優先度 ===');
    allWords.forEach((word, index) => {
      const priority = calculateWordPriority(word);
      const category = getPriorityCategory(priority);
      const isNew = !progressData[word.question];
      
      console.log(`${index + 1}. ${word.question}: 優先度${priority.toFixed(4)} (${category}: ${getPriorityRange(category)})${isNew ? ' [新出]' : ''}`);
    });
    
    // 優先度順にソート
    const sortedWords = [...allWords].sort((a, b) => {
      const priorityA = calculateWordPriority(a);
      const priorityB = calculateWordPriority(b);
      return priorityB - priorityA;
    });
    
    console.log('');
    console.log('=== 優先度順（高い順）===');
    sortedWords.forEach((word, index) => {
      const priority = calculateWordPriority(word);
      const category = getPriorityCategory(priority);
      const isNew = !progressData[word.question];
      
      console.log(`${index + 1}. ${word.question}: 優先度${priority.toFixed(4)} (${category}: ${getPriorityRange(category)})${isNew ? ' [新出]' : ''}`);
    });
  } else {
    console.log('単語が読み込まれていません');
  }
  
  return '優先度デバッグ完了';
};

// 統計表示の問題を診断するためのデバッグ関数
window.debugStatsDisplay = async function() {
  console.log('=== 統計表示問題診断 ===');
  
  // 1. 履歴データの確認
  const historyList = await getHistoryList();
  console.log(`1. 履歴データ: ${historyList.length}件`);
  historyList.forEach((entry, index) => {
    console.log(`   ${index + 1}. ${entry.title}: hash=${entry.hash}`);
  });
  
  // 2. localStorageの確認
  let allProgress = {};
  try {
    const storedData = localStorage.getItem("allProgressData");
    if (storedData) {
      allProgress = JSON.parse(storedData);
      console.log(`2. localStorage: ${Object.keys(allProgress).length}個の単語帳`);
      Object.entries(allProgress).forEach(([hash, progress]) => {
        const wordCount = Object.keys(progress).length;
        const historyCount = Object.values(progress).reduce((sum, p) => {
          return sum + (p.history ? p.history.length : 0);
        }, 0);
        console.log(`   ${hash}: 単語${wordCount}個, 履歴${historyCount}件`);
      });
    } else {
      console.log('2. localStorage: allProgressDataが存在しません');
    }
  } catch (error) {
    console.log(`2. localStorage: エラー - ${error.message}`);
  }
  
  // 3. 現在のセッションデータの確認
  const currentHash = getCurrentWordbookHash();
  console.log(`3. 現在のセッション: hash=${currentHash}`);
  console.log(`   progressData: ${Object.keys(progressData).length}個の単語`);
  
  // 4. 統計ポップアップ要素の確認
  const statsPopup = document.getElementById('statsPopup');
  const statsContent = document.getElementById('statsContent');
  const globalStatsPopup = document.getElementById('globalStatsPopup');
  
  console.log(`4. 統計ポップアップ要素:`);
  console.log(`   statsPopup: ${!!statsPopup}`);
  console.log(`   statsContent: ${!!statsContent}`);
  console.log(`   globalStatsPopup: ${!!globalStatsPopup}`);
  
  if (statsPopup) {
    console.log(`   statsPopup.display: ${statsPopup.style.display}`);
    console.log(`   statsPopup.offsetWidth: ${statsPopup.offsetWidth}`);
  }
  
  if (statsContent) {
    console.log(`   statsContent.innerHTML.length: ${statsContent.innerHTML.length}`);
  }
  
  // 5. 推奨される対処法
  console.log(`\n=== 推奨される対処法 ===`);
  if (Object.keys(allProgress).length === 0) {
    console.log('1. 学習データがありません。単語帳で学習を開始してください。');
  } else if (Object.keys(progressData).length === 0) {
    console.log('2. 現在のセッションにデータがありません。学習を開始してください。');
  } else {
    console.log('3. データは存在します。統計表示を試してください。');
  }
  
  console.log('4. デバッグモードがONの場合は、詳細なログが表示されます。');
  console.log('5. 統計ボタンをクリックして、コンソールのログを確認してください。');
  
  return '統計表示問題診断完了';
};

// data.json読み込み問題を診断するためのデバッグ関数
window.debugDataJsonLoading = function() {
  // デバッグモードのチェック
  if (!debugMode) {
    console.log('デバッグモードがOFFのため、診断は実行されません');
    console.log('デバッグモードを有効にするには: setDebugMode(true)');
    return 'デバッグモードがOFFのため診断をスキップしました';
  }
  
  console.log('=== data.json読み込み問題診断 ===');
  
  // 1. デバッグモードの確認
  console.log(`1. デバッグモード: ${debugMode ? 'ON' : 'OFF'}`);
  
  // 2. File System Access APIのサポート確認
  console.log(`2. File System Access APIサポート: ${!!window.showOpenFilePicker}`);
  
  // 3. localStorageのセッションデータ確認
  const sessionData = loadSessionData();
  console.log(`3. localStorageセッションデータ: ${sessionData.sessions ? sessionData.sessions.length : 0}件`);
  
  // 4. data.jsonファイルの存在確認（fetch）
  console.log('4. data.jsonファイルの存在確認中...');
  fetch('./data.json')
    .then(response => {
      console.log(`   HTTPステータス: ${response.status}`);
      if (response.ok) {
        return response.text();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    })
    .then(content => {
      console.log(`   ファイルサイズ: ${content.length}文字`);
      console.log(`   ファイル内容（最初の200文字）: ${content.substring(0, 200)}`);
      
      try {
        const data = JSON.parse(content);
        console.log(`   JSON解析成功: version=${data.version}, totalSessions=${data.totalSessions}`);
        if (data.sessions) {
          console.log(`   セッション数: ${data.sessions.length}件`);
        }
      } catch (parseError) {
        console.log(`   JSON解析エラー: ${parseError.message}`);
      }
    })
    .catch(error => {
      console.log(`   fetchエラー: ${error.message}`);
    });
  
  // 5. 推奨される対処法
  console.log(`\n=== 推奨される対処法 ===`);
  console.log('1. デバッグモードを有効にしてください: setDebugMode(true)');
  console.log('2. ブラウザの開発者ツールでコンソールを確認してください');
  console.log('3. data.jsonファイルが正しい場所にあるか確認してください');
  console.log('4. ファイルの内容が正しいJSON形式か確認してください');
  console.log('5. 手動読み込みボタンを試してください');
  
  return 'data.json読み込み問題診断完了';
};

// デバッグモードでの手動data.json読み込み関数
window.debugLoadDataJson = async function() {
  if (!debugMode) {
    console.log('デバッグモードがOFFのため、手動読み込みは実行されません');
    console.log('デバッグモードを有効にするには: setDebugMode(true)');
    return;
  }
  
  console.log('=== デバッグモード手動data.json読み込み ===');
  
  try {
    const data = await loadDataJsonFile();
    if (data && data.sessions) {
      // localStorageに保存
      saveSessionData(data);
      console.log(`✅ data.jsonファイルを読み込みました: ${data.sessions.length}件のセッション`);
      
      // 全体統計を再描画
      drawGlobalStats();
      
      return data;
    } else {
      console.log('❌ data.jsonファイルの読み込みに失敗しました: データが無効です');
      return null;
    }
  } catch (error) {
    console.log(`❌ data.json読み込みエラー: ${error.message}`);
    console.log(`エラーの詳細: ${error.stack}`);
    return null;
  }
};

// 学習中かどうかを判定する関数
function isLearningInProgress() {
  // クイズが開始されているか、または結果画面が表示されているか
  const resultScreen = document.getElementById('resultScreen');
  const isResultScreenVisible = resultScreen && resultScreen.style.display === 'block';
  
  return quizQueue.length > 0 || 
         isResultScreenVisible ||
         (currentWord !== null && currentIndex >= 0);
}

// 学習中断確認ポップアップを表示する関数
function showQuitConfirmPopup() {
  const quitConfirmPopup = document.getElementById('quitConfirmPopup');
  if (quitConfirmPopup) {
    quitConfirmPopup.style.display = 'flex';
  }
}

// 学習を終了する関数
async function quitLearning() {
  showDebugInfo('学習を終了してメニューに戻ります（途中終了）');
  
  // 現在の進捗を保存（XP・連続記録更新なし）
  if (Object.keys(progressData).length > 0) {
    // saveProgress()を呼ばずに、直接localStorageに保存
    const currentHash = getCurrentWordbookHash();
    if (currentHash) {
      let allProgress = JSON.parse(localStorage.getItem("allProgressData") || "{}");
      allProgress[currentHash] = progressData;
      localStorage.setItem("allProgressData", JSON.stringify(allProgress));
      showDebugInfo('進捗データを保存しました（XP・連続記録更新なし）');
    }
  }
  
  // 学習状態をリセット
  quizQueue = [];
  currentIndex = -1;
  currentWord = null;
  wrongList = [];
  correctCount = 0;
  sessionStartTime = null;
  sessionEndTime = null;
  questionTimes = [];
  lastQuestionTime = null;
  sessionWrongCounts = {};
  
  // 画面をメニューに戻す
  hideResultScreen();
  await showMenuScreen();
  
  showDebugInfo('学習終了完了（途中終了のためXP・連続記録は更新されません）');
}