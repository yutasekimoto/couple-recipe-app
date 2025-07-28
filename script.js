// 夫婦向けレシピ・献立共有アプリ - メインスクリプト

class CoupleRecipeApp {
  constructor() {
    this.authManager = null;
    this.currentUser = null;
    this.currentScreen = 'loading';
    this.currentView = 'recipes';
    this.currentMonth = new Date();
    this.recipes = [];
    this.folders = [];
    this.mealPlans = [];
    
    this.init();
  }

  async init() {
    try {
      // Supabase初期化
      await initializeSupabase();
      this.authManager = new AuthManager();

      // 認証・ペアリング確認
      await this.checkAuthAndPairing();

      // イベントリスナー設定
      this.setupEventListeners();

    } catch (error) {
      console.error('アプリ初期化エラー:', error);
      this.showMessage('アプリの初期化に失敗しました', 'error');
    }
  }

  async checkAuthAndPairing() {
    try {
      // 匿名認証
      const user = await this.authManager.signInAnonymously();
      if (!user) {
        throw new Error('認証に失敗しました');
      }

      // ユーザープロファイル確認・作成
     