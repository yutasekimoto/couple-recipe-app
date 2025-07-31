// Supabase設定ファイル
// 夫婦向けレシピ・献立共有アプリ

// Supabase接続設定
// 注意: 本番運用時は環境変数を使用してください
const SUPABASE_URL = 'https://ozxiqoayxdnrpomlhdmz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96eGlxb2F5eGRucnBvbWxoZG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MDU1OTIsImV4cCI6MjA2OTI4MTU5Mn0.sOM7MexvEjo8WD2nVX_ras3qrLb_LfPdCV2aboMY3ek';

// Supabase クライアントの初期化
let supabaseClient = null;

// アプリケーション設定
const APP_CONFIG = {
  name: 'CoupleRecipeApp',
  version: '1.0.0',
  debug: true, // 開発中のみtrue
  
  // 機能フラグ
  features: {
    pairing: true,
    recipes: true,
    mealPlanning: true,
    folders: true,
    search: true
  },
  
  // UI設定
  ui: {
    theme: {
      primary: '#E85A4F',
      secondary: '#C5C5C5', 
      accent: '#4F8BE8',
      background: '#FAFAFA',
      text: '#333333'
    },
    
    // カレンダー設定
    calendar: {
      mealTypes: ['lunch', 'dinner'],
      mealTypeLabels: {
        lunch: '昼',
        dinner: '夜'
      }
    }
  }
};

// Supabase初期化関数
async function initializeSupabase() {
  try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      
      if (APP_CONFIG.debug) {
        console.log('Supabase初期化成功');
      }
      
      return supabaseClient;
    } else {
      console.error('Supabaseライブラリが読み込まれていません');
      return null;
    }
  } catch (error) {
    console.error('Supabase初期化エラー:', error);
    return null;
  }
}

// 認証状態管理
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentUserId = null;
    this.pairedUserId = null;
  }
  
  // 既存セッション確認
  async checkExistingSession() {
    if (!supabaseClient) return null;
    
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      
      if (session?.user) {
        this.currentUser = session.user;
        this.currentUserId = session.user.id;
        
        if (APP_CONFIG.debug) {
          console.log('既存セッション:', this.currentUserId);
        }
        
        return session.user;
      }
      
      return null;
    } catch (error) {
      console.error('セッション確認エラー:', error);
      return null;
    }
  }
  
  // メール認証でログイン
  async signInWithEmail(email, password) {
    if (!supabaseClient) return null;
    
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });
      
      if (error) {
        console.error('ログインエラー:', error);
        return { error: error.message };
      }
      
      this.currentUser = data.user;
      this.currentUserId = data.user.id;
      
      if (APP_CONFIG.debug) {
        console.log('ログイン成功:', this.currentUserId);
      }
      
      return { user: data.user };
      
    } catch (error) {
      console.error('ログインエラー:', error);
      return { error: error.message };
    }
  }
  
  // メール認証で新規登録
  async signUpWithEmail(email, password, nickname, role) {
    if (!supabaseClient) return null;
    
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
      });
      
      if (error) {
        console.error('登録エラー:', error);
        return { error: error.message };
      }
      
      if (data.user) {
        // ユーザープロファイルを作成
        const { error: profileError } = await supabaseClient
          .from('users')
          .insert({
            auth_id: data.user.id,
            nickname: nickname,
            role: role,
            display_name: nickname
          });
          
        if (profileError) {
          console.error('プロファイル作成エラー:', profileError);
          return { error: 'プロファイルの作成に失敗しました' };
        }
        
        this.currentUser = data.user;
        this.currentUserId = data.user.id;
        
        if (APP_CONFIG.debug) {
          console.log('登録成功:', this.currentUserId);
        }
        
        return { user: data.user };
      }
      
      return { error: 'ユーザー作成に失敗しました' };
      
    } catch (error) {
      console.error('登録エラー:', error);
      return { error: error.message };
    }
  }
  
  // 匿名認証（既存ユーザー向け・後方互換性）
  async signInAnonymously() {
    if (!supabaseClient) return null;
    
    try {
      // 新規匿名ユーザー作成
      const { data, error } = await supabaseClient.auth.signInAnonymously();
      
      if (error) {
        console.error('匿名認証エラー:', error);
        return null;
      }
      
      this.currentUser = data.user;
      this.currentUserId = data.user.id;
      
      if (APP_CONFIG.debug) {
        console.log('匿名認証成功:', this.currentUserId);
      }
      
      return data.user;
      
    } catch (error) {
      console.error('認証エラー:', error);
      return null;
    }
  }
  
  // アカウント変換（匿名→メール認証）
  async convertAnonymousAccount(email, password) {
    if (!supabaseClient || !this.currentUser) return { error: 'ユーザーが見つかりません' };
    
    try {
      // 匿名ユーザーをメール認証に変換
      const { data, error } = await supabaseClient.auth.updateUser({
        email: email,
        password: password
      });
      
      if (error) {
        console.error('アカウント変換エラー:', error);
        return { error: error.message };
      }
      
      if (APP_CONFIG.debug) {
        console.log('アカウント変換成功:', this.currentUserId);
      }
      
      return { user: data.user };
      
    } catch (error) {
      console.error('アカウント変換エラー:', error);
      return { error: error.message };
    }
  }
  
  // ログアウト
  async signOut() {
    if (!supabaseClient) return;
    
    try {
      const { error } = await supabaseClient.auth.signOut();
      
      if (error) {
        console.error('ログアウトエラー:', error);
        return { error: error.message };
      }
      
      this.currentUser = null;
      this.currentUserId = null;
      this.pairedUserId = null;
      
      return { success: true };
      
    } catch (error) {
      console.error('ログアウトエラー:', error);
      return { error: error.message };
    }
  }
  
  // ユーザープロファイル確認・作成
  async ensureUserProfile() {
    if (!this.currentUserId) return null;
    
    try {
      // 既存プロファイル確認
      const { data: existingUser, error: fetchError } = await supabaseClient
        .from('users')
        .select('*')
        .eq('auth_id', this.currentUserId)
        .single();
      
      if (existingUser) {
        this.pairedUserId = existingUser.paired_with;
        return existingUser;
      }
      
      // 新規プロファイル作成
      const { data: newUser, error: insertError } = await supabaseClient
        .from('users')
        .insert({
          auth_id: this.currentUserId,
          display_name: `ユーザー${Date.now()}`
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('プロファイル作成エラー:', insertError);
        return null;
      }
      
      if (APP_CONFIG.debug) {
        console.log('プロファイル作成完了:', newUser);
      }
      
      return newUser;
      
    } catch (error) {
      console.error('プロファイル確認エラー:', error);
      return null;
    }
  }
  
  // ペアリング状態確認
  async checkPairingStatus() {
    if (!this.currentUserId) return null;
    
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('paired_with, pair_code, nickname, role')
        .eq('auth_id', this.currentUserId)
        .single();
      
      if (error) {
        console.error('ペアリング状態確認エラー:', error);
        return null;
      }
      
      this.pairedUserId = data.paired_with;
      return data;
      
    } catch (error) {
      console.error('ペアリング確認エラー:', error);
      return null;
    }
  }
}

// データベースヘルパー関数
const DatabaseHelper = {
  // レシピ関連
  async getRecipes() {
    if (!supabaseClient) return [];
    
    try {
      const { data, error } = await supabaseClient
        .from('recipes')
        .select(`
          *,
          recipe_tag_relations (
            recipe_tags (
              id, name, color
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('レシピ取得エラー:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('レシピ取得エラー:', error);
      return [];
    }
  },
  
  // タグ関連
  async getTags() {
    if (!supabaseClient) return [];
    
    try {
      const { data, error } = await supabaseClient
        .from('recipe_tags')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('タグ取得エラー:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('タグ取得エラー:', error);
      return [];
    }
  },
  
  // 献立関連
  async getMealPlans(startDate, endDate) {
    if (!supabaseClient) return [];
    
    try {
      const { data, error } = await supabaseClient
        .from('meal_plans')
        .select(`
          *,
          recipes (
            id, title, recipe_url, cooking_time_minutes
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      
      if (error) {
        console.error('献立取得エラー:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('献立取得エラー:', error);
      return [];
    }
  }
};

// グローバルに公開
window.APP_CONFIG = APP_CONFIG;
window.AuthManager = AuthManager;
window.DatabaseHelper = DatabaseHelper;
window.initializeSupabase = initializeSupabase;