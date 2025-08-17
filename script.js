// 夫婦向けレシピ・献立共有アプリ - メインスクリプト

class CoupleRecipeApp {
  constructor() {
    this.authManager = null;
    this.currentUser = null;
    this.currentScreen = 'loading';
    this.currentView = 'recipes';
    this.currentMonth = new Date();
    this.recipes = [];
    this.tags = [];
    this.mealPlans = [];
    this.pendingMealPlan = null; // 献立作成中のレシピ追加用
    this.hiddenMealSlots = new Set(); // 非表示にした献立枠を管理
    this.lastMagicLinkSent = 0; // マジックリンク送信時刻を追跡
    
    this.init();
  }

  async init() {
    try {
      console.log('アプリ初期化開始...');
      
      // タイムアウト付きでSupabase初期化
      const initTimeout = setTimeout(() => {
        console.error('初期化タイムアウト - フォールバックします');
        this.fallbackInit();
      }, 10000); // 10秒タイムアウト
      
      console.log('Supabase初期化中...');
      if (typeof initializeSupabase === 'function') {
        await initializeSupabase();
        console.log('Supabase初期化完了');
      } else {
        console.warn('initializeSupabase関数が見つかりません - config.jsを確認してください');
        throw new Error('Supabase初期化に失敗しました');
      }
      
      this.authManager = new AuthManager();
      console.log('AuthManager作成完了');

      // URLパラメータをチェック（マジックリンクの場合）
      this.handleMagicLinkAuth();

      // 認証・ペアリング確認
      console.log('認証チェック開始...');
      await this.checkAuthAndPairing();
      console.log('認証チェック完了');

      // イベントリスナー設定
      console.log('イベントリスナー設定中...');
      this.setupEventListeners();
      console.log('アプリ初期化完了');
      
      clearTimeout(initTimeout);

    } catch (error) {
      console.error('アプリ初期化エラー:', error);
      this.fallbackInit();
    }
  }
  
  fallbackInit() {
    console.log('フォールバック初期化を実行...');
    this.showScreen('pairing');
    this.setupEventListeners();
    this.showMessage('初期化に時間がかかっています。しばらくお待ちください。', 'info');
  }

  handleMagicLinkAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    
    if (accessToken) {
      console.log('マジックリンクによる認証を検出');
      // URLからパラメータをクリア
      const url = new URL(window.location);
      url.search = '';
      window.history.replaceState({}, document.title, url.toString());
      
      this.showMessage('ログインしました！', 'success');
    }
  }

  async checkAuthAndPairing() {
    try {
      console.log('認証確認開始...');
      
      // 既存の匿名ユーザーIDを確認（ローカルストレージから）
      const savedUserId = localStorage.getItem('couple_app_user_id');
      console.log('保存されたユーザーID:', savedUserId);
      
      // まず既存セッションを確認
      console.log('既存セッション確認中...');
      let user = await this.authManager.checkExistingSession();
      
      if (!user) {
        console.log('既存セッションなし - 匿名認証開始...');
        // 既存セッションがない場合は匿名認証
        user = await Promise.race([
          this.authManager.signInAnonymously(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('認証タイムアウト')), 8000))
        ]);
      } else {
        console.log('既存セッション確認完了');
      }
      
      if (!user) {
        throw new Error('認証に失敗しました');
      }
      console.log('認証完了:', user.id);
      
      // ユーザーIDを保存
      localStorage.setItem('couple_app_user_id', user.id);

      console.log('ユーザープロファイル確認中...');
      // ユーザープロファイル確認・作成
      this.currentUser = await Promise.race([
        this.authManager.ensureUserProfile(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('プロファイル作成タイムアウト')), 5000))
      ]);
      
      if (!this.currentUser) {
        throw new Error('ユーザープロファイルの作成に失敗しました');
      }
      console.log('ユーザープロファイル確認完了');

      console.log('ペアリング状態確認中...');
      // ペアリング状態確認
      const pairingStatus = await Promise.race([
        this.authManager.checkPairingStatus(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ペアリング確認タイムアウト')), 5000))
      ]);
      
      if (pairingStatus?.paired_with) {
        console.log('ペア済み - データ読み込み中...');
        // ペア済み - メインアプリを表示
        await this.loadAppData();
        this.showScreen('main');
        console.log('メイン画面表示完了');
        
        // プロフィール未設定の場合はモーダルを表示
        if (!this.currentUser.nickname || !this.currentUser.role) {
          setTimeout(() => {
            this.showProfileModal();
            this.showMessage('プロフィールを設定してください', 'info');
          }, 500);
        } else {
          this.updateUserDisplay();
        }
      } else {
        console.log('未ペア - ペアリング画面表示');
        // 未ペア - ペアリング画面を表示
        this.showScreen('pairing');
      }

    } catch (error) {
      console.error('認証・ペアリング確認エラー:', error);
      console.log('フォールバック: 直接ペアリング画面を表示');
      this.showMessage(`一時的な問題が発生しました。再度お試しください。`, 'warning');
      this.showScreen('pairing');
    }
  }

  setupEventListeners() {
    // 認証関連
    document.getElementById('login-form-element')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
    document.getElementById('register-form-element')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleRegister();
    });
    document.getElementById('convert-form-element')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAccountConversion();
    });
    
    // 認証フォーム切り替え
    document.getElementById('show-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthForm('register');
    });
    document.getElementById('show-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthForm('login');
    });
    document.getElementById('show-convert')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthForm('convert');
    });
    document.getElementById('show-login-from-convert')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthForm('login');
    });

    // ペアリング関連
    document.getElementById('generate-code-btn')?.addEventListener('click', () => this.generatePairCode());
    document.getElementById('enter-code-btn')?.addEventListener('click', () => this.showCodeInput());
    document.getElementById('pair-btn')?.addEventListener('click', () => this.performPairing());
    document.getElementById('back-to-options')?.addEventListener('click', () => this.showPairingOptions());
    document.getElementById('back-to-options-2')?.addEventListener('click', () => this.showPairingOptions());
    document.getElementById('start-app-btn')?.addEventListener('click', () => this.startApp());
    document.getElementById('skip-pairing-btn')?.addEventListener('click', () => this.skipPairing());
    document.getElementById('email-login-btn')?.addEventListener('click', () => this.showEmailLogin());

    // ナビゲーション
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.closest('.nav-btn').dataset.view;
        this.switchView(view);
      });
    });

    // レシピ関連
    document.getElementById('add-recipe-btn')?.addEventListener('click', () => this.showRecipeModal());
    document.getElementById('close-recipe-modal')?.addEventListener('click', () => this.hideRecipeModal());
    document.getElementById('cancel-recipe')?.addEventListener('click', () => this.hideRecipeModal());
    document.getElementById('save-recipe')?.addEventListener('click', () => this.saveRecipe());
    document.getElementById('add-tag-btn')?.addEventListener('click', () => this.addNewTag());

    // 調理時間スライダー
    document.getElementById('recipe-cooking-time')?.addEventListener('input', (e) => {
      const minutes = parseInt(e.target.value);
      document.getElementById('cooking-time-display').textContent = this.formatCookingTime(minutes);
    });

    // 献立モーダル関連
    document.getElementById('close-meal-modal')?.addEventListener('click', () => this.hideMealModal());
    document.getElementById('cancel-meal')?.addEventListener('click', () => this.hideMealModal());
    document.getElementById('save-meal')?.addEventListener('click', () => this.saveMealFromModal());
    
    // プロフィール設定関連
    document.getElementById('profile-btn')?.addEventListener('click', () => this.showProfileModal());
    document.getElementById('close-profile-modal')?.addEventListener('click', () => this.hideProfileModal());
    document.getElementById('cancel-profile')?.addEventListener('click', () => this.hideProfileModal());
    document.getElementById('save-profile')?.addEventListener('click', () => this.saveProfile());
    
    // ログアウト関連
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
    
    
    // 献立モーダル内のレシピ検索
    document.getElementById('meal-recipe-search')?.addEventListener('input', (e) => {
      this.renderRecipeOptions(e.target.value);
    });

    // 検索
    document.getElementById('recipe-search')?.addEventListener('input', (e) => {
      this.filterRecipes(e.target.value);
    });

    // タグフィルター
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        const tagId = e.target.dataset.tag;
        this.filterByTag(tagId);
      }
    });

    // モーダル外クリックで閉じる
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  async loadAppData() {
    try {
      console.log('アプリデータ読み込み開始...');
      
      // 並列でデータを取得（タイムアウト付き）
      const [recipes, tags, mealPlans] = await Promise.race([
        Promise.all([
          DatabaseHelper.getRecipes(),
          DatabaseHelper.getTags(),
          DatabaseHelper.getMealPlans(
            this.getWeekStart().toISOString().split('T')[0],
            this.getWeekEnd().toISOString().split('T')[0]
          )
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('データ読み込みタイムアウト')), 10000)
        )
      ]);

      console.log(`データ取得結果: レシピ${recipes?.length || 0}件, タグ${tags?.length || 0}件, 献立${mealPlans?.length || 0}件`);

      this.recipes = recipes || [];
      // タグの重複を除去（名前で判定）
      const uniqueTags = [];
      const seenNames = new Set();
      (tags || []).forEach(tag => {
        if (!seenNames.has(tag.name)) {
          seenNames.add(tag.name);
          uniqueTags.push(tag);
        }
      });
      this.tags = uniqueTags;
      console.log(`重複除去後のタグ: ${this.tags.length}件`, this.tags.map(t => t.name));
      this.mealPlans = mealPlans || [];

      // 非表示設定をローカルストレージから復元
      const savedHiddenSlots = localStorage.getItem('hiddenMealSlots');
      if (savedHiddenSlots) {
        try {
          const hiddenSlots = JSON.parse(savedHiddenSlots);
          this.hiddenMealSlots = new Set(hiddenSlots);
        } catch (error) {
          console.warn('非表示設定の復元に失敗:', error);
          this.hiddenMealSlots = new Set();
        }
      } else {
        this.hiddenMealSlots = new Set();
      }

      // UIを更新
      this.renderRecipes();
      this.renderTagFilters();
      this.renderMealPlans();
      console.log('アプリデータ読み込み完了');

    } catch (error) {
      console.error('データ読み込みエラー:', error);
      this.showMessage('データの読み込みに失敗しました', 'error');
    }
  }

  renderTagFilters() {
    const container = document.getElementById('tag-filters');
    
    let filtersHtml = '<button class="filter-btn active" data-tag="all">すべて</button>';
    
    // さらに重複を確実に除去
    const uniqueTagsMap = new Map();
    this.tags.forEach(tag => {
      if (!uniqueTagsMap.has(tag.name)) {
        uniqueTagsMap.set(tag.name, tag);
      }
    });
    
    uniqueTagsMap.forEach(tag => {
      filtersHtml += `
        <button class="filter-btn" data-tag="${tag.id}" style="border-color: ${tag.color || '#E0E0E0'}">
          ${this.escapeHtml(tag.name)}
        </button>
      `;
    });

    container.innerHTML = filtersHtml;

    // フィルターボタンにイベント追加
    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tagId = e.target.dataset.tag;
        this.filterByTag(tagId);
      });
    });
  }

  renderRecipes() {
    const grid = document.getElementById('recipes-grid');
    
    if (this.recipes.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>まだレシピがありません</p>
          <p>最初のレシピを追加してみましょう！</p>
        </div>
      `;
      return;
    }

    const recipesHtml = this.recipes.map(recipe => `
      <div class="recipe-card" data-recipe-id="${recipe.id}">
        <div class="recipe-header">
          <h3 class="recipe-title">${this.escapeHtml(recipe.title)}</h3>
          <div class="recipe-actions">
            <button class="btn-icon" onclick="app.editRecipe('${recipe.id}')" title="編集">
              ✏️
            </button>
            <button class="btn-icon" onclick="app.deleteRecipe('${recipe.id}')" title="削除">
              🗑️
            </button>
          </div>
        </div>
        
        ${recipe.description ? `<p class="recipe-description">${this.escapeHtml(recipe.description)}</p>` : ''}
        
        <div class="recipe-meta">
          <div class="meta-item">
            <span class="cooking-time">⏱️ ${this.formatCookingTime(recipe.cooking_time_minutes)}</span>
          </div>
        </div>
        
        ${recipe.recipe_url ? `
          <div class="recipe-link">
            <a href="${recipe.recipe_url}" target="_blank" rel="noopener noreferrer">
              レシピを見る →
            </a>
          </div>
        ` : ''}
        
        <div class="recipe-tags">
          ${(recipe.recipe_tag_relations || []).map(rel => {
            if (!rel.recipe_tags) return '';
            return `<span class="recipe-tag" style="background-color: ${rel.recipe_tags.color || '#E0E0E0'}">
              ${this.escapeHtml(rel.recipe_tags.name)}
            </span>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    grid.innerHTML = recipesHtml;
  }

  renderMealPlans() {
    // 献立表示の実装
    console.log('献立を表示します');
  }

  showProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
      // 現在のプロフィール情報をフォームに設定
      if (this.currentUser) {
        const nicknameInput = document.getElementById('user-nickname');
        const roleInputs = document.querySelectorAll('input[name="user-role"]');
        
        if (nicknameInput && this.currentUser.nickname) {
          nicknameInput.value = this.currentUser.nickname;
        }
        
        if (this.currentUser.role) {
          roleInputs.forEach(input => {
            input.checked = (input.value === this.currentUser.role);
          });
        }
      }
      
      modal.classList.remove('hidden');
    }
  }

  hideProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  async saveProfile() {
    try {
      const nickname = document.getElementById('user-nickname')?.value;
      const role = document.querySelector('input[name="user-role"]:checked')?.value;
      const email = document.getElementById('user-email')?.value?.trim();
      
      if (!nickname || !role) {
        this.showMessage('ニックネームと役割を入力してください', 'error');
        return;
      }
      
      // プロフィール保存
      const result = await this.authManager.updateProfile(nickname, role);
      
      if (result.error) {
        this.showMessage(`保存に失敗しました: ${result.error}`, 'error');
        return;
      }
      
      // メール認証設定がある場合はアカウント変換
      if (email) {
        const convertResult = await this.authManager.convertAnonymousAccount(email);
        
        if (convertResult.error) {
          this.showMessage(`メール認証の設定に失敗しました: ${convertResult.error}`, 'warning');
          // プロフィール保存は成功しているので、警告レベルで続行
        } else {
          if (convertResult.success) {
            this.showMessage(`プロフィールを保存し、${email}にマジックリンクを送信しました。メールをご確認ください。`, 'success');
          } else {
            this.showMessage('プロフィールを保存しました。', 'success');
          }
        }
      } else {
        this.showMessage('プロフィールを保存しました', 'success');
      }
      
      // 現在のユーザー情報を更新
      this.currentUser = result.user;
      
      // UI表示を更新
      this.updateUserDisplay();
      
      this.hideProfileModal();
      
    } catch (error) {
      console.error('プロフィール保存エラー:', error);
      this.showMessage('保存に失敗しました', 'error');
    }
  }

  updateUserDisplay() {
    // プロフィールボタンのテキストを更新
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn && this.currentUser) {
      const displayText = this.currentUser.nickname 
        ? `${this.currentUser.nickname} (${this.currentUser.role === 'husband' ? '夫' : this.currentUser.role === 'wife' ? '妻' : this.currentUser.role || '未設定'})`
        : 'プロフィール設定';
      profileBtn.textContent = displayText;
    }
    
    // その他のユーザー情報表示があれば更新
    const userNameDisplay = document.getElementById('user-name-display');
    if (userNameDisplay && this.currentUser?.nickname) {
      userNameDisplay.textContent = this.currentUser.nickname;
    }
  }

  filterByTag(tagId) {
    console.log('タグでフィルタリング:', tagId);
  }

  filterRecipes(searchTerm) {
    console.log('レシピを検索:', searchTerm);
  }

  switchView(view) {
    console.log('ビューを切り替え:', view);
  }

  showRecipeModal() {
    console.log('レシピモーダルを表示');
  }

  hideRecipeModal() {
    console.log('レシピモーダルを非表示');
  }

  saveRecipe() {
    console.log('レシピを保存');
  }

  addNewTag() {
    console.log('新しいタグを追加');
  }

  hideMealModal() {
    console.log('献立モーダルを非表示');
  }

  saveMealFromModal() {
    console.log('献立を保存');
  }

  renderRecipeOptions(searchTerm) {
    console.log('レシピオプションを表示:', searchTerm);
  }

  generatePairCode() {
    console.log('ペアコードを生成');
  }

  showCodeInput() {
    console.log('コード入力を表示');
  }

  performPairing() {
    console.log('ペアリングを実行');
  }

  showPairingOptions() {
    console.log('ペアリングオプションを表示');
  }

  startApp() {
    console.log('アプリを開始');
    this.loadAppData();
    this.showScreen('main');
  }

  skipPairing() {
    console.log('ペアリングをスキップしてアプリを開始');
    this.showMessage('ひとりでアプリを使用します', 'info');
    this.showScreen('main');
    
    // プロフィール設定を促す
    setTimeout(() => {
      this.showProfileModal();
      this.showMessage('プロフィールを設定してください', 'info');
    }, 1000);
  }

  showEmailLogin() {
    console.log('メールログイン画面を表示');
    this.showScreen('auth');
    this.showAuthForm('login');
  }

  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.add('hidden');
    });
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
    this.currentScreen = screenName;
  }

  showMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    container.appendChild(messageDiv);
    
    setTimeout(() => {
      messageDiv.remove();
    }, 5000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatCookingTime(minutes) {
    if (minutes < 60) {
      return `${minutes}分`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours}時間`;
      } else {
        return `${hours}時間${remainingMinutes}分`;
      }
    }
  }

  getWeekStart() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  getWeekEnd() {
    const weekStart = this.getWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  }

  // 認証関連メソッド
  showAuthForm(formType) {
    const forms = ['login', 'register', 'convert'];
    forms.forEach(type => {
      const form = document.getElementById(`${type}-form`);
      if (form) {
        form.classList.toggle('hidden', type !== formType);
      }
    });
  }

  async handleLogin() {
    const email = document.getElementById('login-email').value;

    if (!email) {
      this.showMessage('メールアドレスを入力してください', 'error');
      return;
    }

    // 21秒制限をクライアント側でチェック
    const now = Date.now();
    const timeSinceLastSent = now - this.lastMagicLinkSent;
    if (timeSinceLastSent < 21000) {
      const remainingTime = Math.ceil((21000 - timeSinceLastSent) / 1000);
      this.showMessage(`送信間隔が短すぎます。${remainingTime}秒後に再度お試しください。`, 'warning');
      return;
    }

    const submitButton = document.querySelector('#login-form-element button[type="submit"]');
    const originalText = submitButton.textContent;
    
    try {
      // ボタンを無効化
      submitButton.disabled = true;
      submitButton.textContent = '送信中...';
      
      const result = await this.authManager.signInWithEmail(email);
      
      if (result.error) {
        if (result.error.includes('21 seconds')) {
          this.showMessage('送信間隔が短すぎます。21秒後に再度お試しください。', 'warning');
        } else {
          this.showMessage(`マジックリンクの送信に失敗しました: ${result.error}`, 'error');
        }
        return;
      }

      // 送信成功時刻を記録
      this.lastMagicLinkSent = now;
      this.showMessage(`${email}にログイン用のリンクを送信しました。メールをご確認ください。`, 'success');
      
      // 21秒間ボタンを無効化
      this.startMagicLinkCooldown(submitButton, originalText);
      
    } catch (error) {
      console.error('マジックリンク送信エラー:', error);
      if (error.message && error.message.includes('21 seconds')) {
        this.showMessage('送信間隔が短すぎます。21秒後に再度お試しください。', 'warning');
      } else {
        this.showMessage('マジックリンクの送信に失敗しました', 'error');
      }
    } finally {
      // エラー時は即座にボタンを復活
      if (!submitButton.disabled || !submitButton.textContent.includes('秒後')) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  }

  startMagicLinkCooldown(button, originalText) {
    let remaining = 21;
    button.textContent = `${remaining}秒後に再送信可能`;
    
    const countdown = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        button.textContent = `${remaining}秒後に再送信可能`;
      } else {
        button.disabled = false;
        button.textContent = originalText;
        clearInterval(countdown);
      }
    }, 1000);
  }

  async handleRegister() {
    const email = document.getElementById('register-email').value;
    const nickname = document.getElementById('register-nickname').value;
    const role = document.querySelector('input[name="register-role"]:checked')?.value;

    if (!email || !nickname || !role) {
      this.showMessage('すべての項目を入力してください', 'error');
      return;
    }

    try {
      const result = await this.authManager.signUpWithEmail(email, nickname, role);
      
      if (result.error) {
        this.showMessage(`登録用リンクの送信に失敗しました: ${result.error}`, 'error');
        return;
      }

      this.showMessage(`${email}にアカウント作成用のリンクを送信しました。メールをご確認ください。`, 'success');
      
    } catch (error) {
      console.error('登録エラー:', error);
      this.showMessage('登録用リンクの送信に失敗しました', 'error');
    }
  }

  async handleAccountConversion() {
    const email = document.getElementById('convert-email').value;

    if (!email) {
      this.showMessage('メールアドレスを入力してください', 'error');
      return;
    }

    try {
      const result = await this.authManager.convertAnonymousAccount(email);
      
      if (result.error) {
        this.showMessage(`変換用リンクの送信に失敗しました: ${result.error}`, 'error');
        return;
      }

      this.showMessage(`${email}にアカウント変換用のリンクを送信しました。メールをご確認ください。`, 'success');
      
    } catch (error) {
      console.error('変換エラー:', error);
      this.showMessage('アカウント変換用リンクの送信に失敗しました', 'error');
    }
  }

  async handleLogout() {
    try {
      const result = await this.authManager.signOut();
      
      if (result.error) {
        this.showMessage(`ログアウトに失敗しました: ${result.error}`, 'error');
        return;
      }

      // ローカルデータをクリア
      localStorage.removeItem('couple_app_user_id');
      
      this.showMessage('ログアウトしました', 'success');
      
      // 初期状態にリセット
      this.currentUser = null;
      this.recipes = [];
      this.tags = [];
      this.mealPlans = [];
      
      // ペアリング画面に戻る
      setTimeout(() => {
        this.showScreen('pairing');
      }, 1000);
      
    } catch (error) {
      console.error('ログアウトエラー:', error);
      this.showMessage('ログアウトに失敗しました', 'error');
    }
  }
}

// アプリ初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new CoupleRecipeApp();
});

// グローバル関数（HTMLから呼び出し用）
window.app = null;
document.addEventListener('DOMContentLoaded', () => {
  window.app = app;
});