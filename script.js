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
      await initializeSupabase();
      console.log('Supabase初期化完了');
      
      this.authManager = new AuthManager();
      console.log('AuthManager作成完了');

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

  async checkAuthAndPairing() {
    try {
      console.log('匿名認証開始...');
      // 匿名認証
      const user = await Promise.race([
        this.authManager.signInAnonymously(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('認証タイムアウト')), 8000))
      ]);
      
      if (!user) {
        throw new Error('認証に失敗しました');
      }
      console.log('匿名認証完了');

      console.log('ユーザープロファイル確認中...');
      // ユーザープロファイル確認・作成
      this.currentUser = await Promise.race([
        this.authManager.ensureUserProfile(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('プロファイル作成タイムアウト')), 5000))
      ]);
      
      if (!this.currentUser) {
        throw new Error('ユーザープロファイルの作成に失敗しました');
      }
      console.log('ユーザープロファイル作成完了');

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
      } else {
        console.log('未ペア - ペアリング画面表示');
        // 未ペア - ペアリング画面を表示
        this.showScreen('pairing');
      }

    } catch (error) {
      console.error('認証・ペアリング確認エラー:', error);
      this.showMessage(`認証エラー: ${error.message}`, 'error');
      this.showScreen('pairing');
    }
  }

  setupEventListeners() {
    // ペアリング関連
    document.getElementById('generate-code-btn')?.addEventListener('click', () => this.generatePairCode());
    document.getElementById('enter-code-btn')?.addEventListener('click', () => this.showCodeInput());
    document.getElementById('pair-btn')?.addEventListener('click', () => this.performPairing());
    document.getElementById('back-to-options')?.addEventListener('click', () => this.showPairingOptions());
    document.getElementById('back-to-options-2')?.addEventListener('click', () => this.showPairingOptions());
    document.getElementById('start-app-btn')?.addEventListener('click', () => this.startApp());

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

    // 検索
    document.getElementById('recipe-search')?.addEventListener('input', (e) => {
      this.filterRecipes(e.target.value);
    });


    // モーダル外クリックで閉じる
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideRecipeModal();
      }
    });
  }

  // ===== 画面・ビュー管理 =====
  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.add('hidden');
    });
    document.getElementById(`${screenName}-screen`)?.classList.remove('hidden');
    this.currentScreen = screenName;
  }

  switchView(viewName) {
    // ナビゲーション更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');

    // ビュー切り替え
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });
    document.getElementById(`${viewName}-view`)?.classList.remove('hidden');
    document.getElementById(`${viewName}-view`)?.classList.add('active');

    this.currentView = viewName;

    // ビュー別の初期化処理
    if (viewName === 'calendar') {
      // データが既に読み込まれている場合は即座に表示、そうでなければ読み込む
      if (this.mealPlans && this.mealPlans.length >= 0) {
        this.renderMealPlans();
      } else {
        this.loadAppData().then(() => this.renderMealPlans());
      }
    }
  }

  // ===== ペアリング機能 =====
  showPairingOptions() {
    document.querySelectorAll('.pairing-status > div').forEach(div => {
      div.classList.add('hidden');
    });
    document.getElementById('status-unpaired').classList.remove('hidden');
  }

  async generatePairCode() {
    try {
      // ペアリングコード生成
      const { data, error } = await supabaseClient.rpc('generate_pair_code');
      
      if (error) throw error;

      const pairCode = data;

      // ユーザーのペアコードを更新
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ pair_code: pairCode })
        .eq('auth_id', this.authManager.currentUserId);

      if (updateError) throw updateError;

      // コード表示
      document.getElementById('generated-code').textContent = pairCode;
      document.querySelectorAll('.pairing-status > div').forEach(div => {
        div.classList.add('hidden');
      });
      document.getElementById('status-generate').classList.remove('hidden');

    } catch (error) {
      console.error('ペアリングコード生成エラー:', error);
      this.showMessage('ペアリングコードの生成に失敗しました', 'error');
    }
  }

  showCodeInput() {
    document.querySelectorAll('.pairing-status > div').forEach(div => {
      div.classList.add('hidden');
    });
    document.getElementById('status-enter').classList.remove('hidden');
    document.getElementById('pair-code-input').focus();
  }

  async performPairing() {
    const codeInput = document.getElementById('pair-code-input');
    const pairCode = codeInput.value.trim();

    if (!pairCode || pairCode.length !== 6) {
      this.showMessage('6桁のコードを入力してください', 'error');
      return;
    }

    try {
      // 入力されたコードのユーザーを検索
      const { data: partnerUser, error: searchError } = await supabaseClient
        .from('users')
        .select('id, display_name')
        .eq('pair_code', pairCode)
        .single();

      if (searchError || !partnerUser) {
        this.showMessage('無効なペアリングコードです', 'error');
        return;
      }

      // 相互ペアリング
      const { error: updateError1 } = await supabaseClient
        .from('users')
        .update({ paired_with: partnerUser.id })
        .eq('auth_id', this.authManager.currentUserId);

      const { error: updateError2 } = await supabaseClient
        .from('users')
        .update({ paired_with: this.currentUser.id })
        .eq('id', partnerUser.id);

      if (updateError1 || updateError2) {
        throw new Error('ペアリングの更新に失敗しました');
      }

      // ペアリング完了
      this.authManager.pairedUserId = partnerUser.id;
      document.querySelectorAll('.pairing-status > div').forEach(div => {
        div.classList.add('hidden');
      });
      document.getElementById('status-paired').classList.remove('hidden');

      this.showMessage('ペアリングが完了しました！', 'success');

    } catch (error) {
      console.error('ペアリングエラー:', error);
      this.showMessage('ペアリングに失敗しました', 'error');
    }
  }

  async startApp() {
    await this.loadAppData();
    this.showScreen('main');
  }

  // ===== データ管理 =====
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
      this.tags = tags || [];
      this.mealPlans = mealPlans || [];

      // UI更新
      this.renderRecipes();
      this.renderTagFilters();
      
      console.log('アプリデータ読み込み完了');

    } catch (error) {
      console.error('データ読み込みエラー:', error);
      this.showMessage(`データ読み込みエラー: ${error.message}`, 'error');
      
      // エラー時はデフォルト値を設定
      this.recipes = [];
      this.tags = [];
      this.mealPlans = [];
      this.renderRecipes();
      this.renderTagFilters();
    }
  }

  // ===== レシピ管理 =====
  showRecipeModal(recipe = null) {
    const modal = document.getElementById('recipe-modal');
    const form = document.getElementById('recipe-form');
    
    // 編集中のレシピIDを保存
    this.editingRecipeId = recipe ? recipe.id : null;
    
    if (recipe) {
      // 編集モード
      document.getElementById('recipe-modal-title').textContent = 'レシピ編集';
      document.getElementById('recipe-title').value = recipe.title || '';
      document.getElementById('recipe-url').value = recipe.recipe_url || '';
      document.getElementById('recipe-description').value = recipe.description || '';
    } else {
      // 新規追加モード
      document.getElementById('recipe-modal-title').textContent = 'レシピ追加';
      form.reset();
    }

    this.renderTagCheckboxes(recipe);
    modal.classList.remove('hidden');
  }

  hideRecipeModal() {
    document.getElementById('recipe-modal').classList.add('hidden');
  }

  async saveRecipe() {
    const form = document.getElementById('recipe-form');
    const formData = new FormData(form);

    const recipeData = {
      title: formData.get('recipe-title') || document.getElementById('recipe-title').value,
      recipe_url: document.getElementById('recipe-url').value || null,
      description: document.getElementById('recipe-description').value || null,
      user_id: this.currentUser.id
    };

    if (!recipeData.title.trim()) {
      this.showMessage('レシピ名を入力してください', 'error');
      return;
    }

    try {
      let savedRecipe;
      
      if (this.editingRecipeId) {
        // 編集モード：既存レシピを更新
        const { data, error } = await supabaseClient
          .from('recipes')
          .update(recipeData)
          .eq('id', this.editingRecipeId)
          .select()
          .single();

        if (error) throw error;
        savedRecipe = data;

        // 既存のタグ関連付けを削除
        await supabaseClient
          .from('recipe_tag_relations')
          .delete()
          .eq('recipe_id', this.editingRecipeId);

      } else {
        // 新規作成モード
        const { data, error } = await supabaseClient
          .from('recipes')
          .insert(recipeData)
          .select()
          .single();

        if (error) throw error;
        savedRecipe = data;
      }

      // タグ関連付け
      const selectedTags = Array.from(document.querySelectorAll('#tag-checkboxes input:checked'))
        .map(checkbox => checkbox.value);

      if (selectedTags.length > 0) {
        const tagRelations = selectedTags.map(tagId => ({
          recipe_id: savedRecipe.id,
          tag_id: tagId
        }));

        const { error: relationError } = await supabaseClient
          .from('recipe_tag_relations')
          .insert(tagRelations);

        if (relationError) {
          console.warn('タグ関連付けエラー:', relationError);
        }
      }

      this.hideRecipeModal();
      this.showMessage(this.editingRecipeId ? 'レシピを更新しました' : 'レシピを保存しました', 'success');
      
      // 全データを再読み込み（献立画面でも使用されるため）
      await this.loadAppData();
      
      if (!this.editingRecipeId) {
        // 新規作成の場合はレシピビューの表示も更新
        if (this.currentView === 'recipes') {
          this.renderRecipes();
          this.renderTagFilters();
        }
        // 献立ビューの場合はレンダリングを更新
        if (this.currentView === 'calendar') {
          this.renderMealPlans();
        }
        
        // 献立作成中にレシピを作成した場合、その献立に追加
        if (this.pendingMealPlan) {
          await this.saveMealPlan(
            this.pendingMealPlan.date,
            this.pendingMealPlan.mealType,
            savedRecipe.id,
            null
          );
          this.pendingMealPlan = null;
        }
      }
      
      this.editingRecipeId = null;

    } catch (error) {
      console.error('レシピ保存エラー:', error);
      this.showMessage('レシピの保存に失敗しました', 'error');
    }
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
        
        
        ${recipe.recipe_url ? `
          <div class="recipe-link">
            <a href="${recipe.recipe_url}" target="_blank" rel="noopener noreferrer">
              レシピを見る →
            </a>
          </div>
        ` : ''}
        
        <div class="recipe-tags">
          ${(recipe.recipe_tag_relations || []).map(rel => 
            `<span class="recipe-tag" style="background-color: ${rel.recipe_tags.color}">
              ${this.escapeHtml(rel.recipe_tags.name)}
            </span>`
          ).join('')}
        </div>
      </div>
    `).join('');

    grid.innerHTML = recipesHtml;
  }

  renderTagFilters() {
    const container = document.getElementById('tag-filters');
    
    let filtersHtml = '<button class="filter-btn active" data-tag="all">すべて</button>';
    
    this.tags.forEach(tag => {
      filtersHtml += `
        <button class="filter-btn" data-tag="${tag.id}" style="border-color: ${tag.color}">
          ${this.escapeHtml(tag.name)}
        </button>
      `;
    });

    container.innerHTML = filtersHtml;

    // フィルターボタンにイベント追加
    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterRecipesByTag(btn.dataset.tag);
      });
    });
  }

  renderTagCheckboxes(recipe = null) {
    const container = document.getElementById('tag-checkboxes');
    
    let checkboxesHtml = '';
    
    this.tags.forEach(tag => {
      const isChecked = recipe && recipe.recipe_tag_relations?.some(rel => 
        rel.recipe_tags.id === tag.id
      );
      
      checkboxesHtml += `
        <div class="tag-item">
          <label class="checkbox-label">
            <input type="checkbox" value="${tag.id}" ${isChecked ? 'checked' : ''}>
            <span class="checkbox-text" style="color: ${tag.color}">
              <input type="text" class="tag-name-input" value="${this.escapeHtml(tag.name)}" 
                     onblur="window.app.updateTagName('${tag.id}', this.value)" 
                     onkeypress="if(event.key==='Enter') this.blur()" 
                     style="color: ${tag.color}">
            </span>
          </label>
          <button type="button" class="btn-icon delete-tag-btn" onclick="window.app.deleteTag('${tag.id}')" title="タグ削除">
            ×
          </button>
        </div>
      `;
    });

    container.innerHTML = checkboxesHtml;
  }

  filterRecipes(searchTerm) {
    const term = searchTerm.toLowerCase();
    const cards = document.querySelectorAll('.recipe-card');
    
    cards.forEach(card => {
      const title = card.querySelector('.recipe-title').textContent.toLowerCase();
      const description = card.querySelector('.recipe-description')?.textContent.toLowerCase() || '';
      
      if (title.includes(term) || description.includes(term)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  filterRecipesByTag(tagId) {
    const cards = document.querySelectorAll('.recipe-card');
    
    cards.forEach(card => {
      if (tagId === 'all') {
        card.style.display = 'block';
      } else {
  