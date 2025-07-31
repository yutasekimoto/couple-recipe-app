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

    // 調理時間スライダー
    document.getElementById('recipe-cooking-time')?.addEventListener('input', (e) => {
      const minutes = parseInt(e.target.value);
      document.getElementById('cooking-time-display').textContent = this.formatCookingTime(minutes);
    });

    // 献立モーダル関連
    document.getElementById('close-meal-modal')?.addEventListener('click', () => this.hideMealModal());
    document.getElementById('cancel-meal')?.addEventListener('click', () => this.hideMealModal());
    document.getElementById('save-meal')?.addEventListener('click', () => this.saveMealFromModal());
    
    // 献立モーダル内のレシピ検索
    document.getElementById('meal-recipe-search')?.addEventListener('input', (e) => {
      this.renderRecipeOptions(e.target.value);
    });

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
      document.getElementById('recipe-cooking-time').value = recipe.cooking_time_minutes || 15;
      document.getElementById('cooking-time-display').textContent = this.formatCookingTime(recipe.cooking_time_minutes || 15);
    } else {
      // 新規追加モード
      document.getElementById('recipe-modal-title').textContent = 'レシピ追加';
      form.reset();
      
      // 検索ワードからの作成の場合、タイトルに設定
      if (this.pendingRecipeTitle) {
        document.getElementById('recipe-title').value = this.pendingRecipeTitle;
        this.pendingRecipeTitle = null;
      }
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
      cooking_time_minutes: parseInt(document.getElementById('recipe-cooking-time').value) || 15,
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
        
        // 献立作成中にレシピを作成した場合、モーダル上で選択状態にする
        if (this.pendingMealPlan) {
          // 選択リストに追加（重複チェック）
          if (!this.selectedRecipeIds) {
            this.selectedRecipeIds = [];
          }
          if (!this.selectedRecipeIds.includes(savedRecipe.id)) {
            this.selectedRecipeIds.push(savedRecipe.id);
          }
          // モーダルを再表示
          this.showMealModal(
            this.pendingMealPlan.date,
            this.pendingMealPlan.mealType,
            this.pendingMealPlan.existingMealPlan
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
        const recipeId = card.dataset.recipeId;
        const recipe = this.recipes.find(r => r.id === recipeId);
        const hasTag = recipe?.recipe_tag_relations?.some(rel => 
          rel.recipe_tags.id === tagId
        );
        
        card.style.display = hasTag ? 'block' : 'none';
      }
    });
  }

  // ===== 献立機能 =====
  renderMealPlans() {
    const container = document.getElementById('meal-plans-list');
    
    // 日付でグループ化（複数メニュー対応）
    const groupedMealPlans = {};
    this.mealPlans.forEach(mp => {
      if (!groupedMealPlans[mp.date]) {
        groupedMealPlans[mp.date] = { lunch: [], dinner: [] };
      }
      if (!groupedMealPlans[mp.date][mp.meal_type]) {
        groupedMealPlans[mp.date][mp.meal_type] = [];
      }
      groupedMealPlans[mp.date][mp.meal_type].push(mp);
    });
    
    // 各メニューを順序でソート
    Object.keys(groupedMealPlans).forEach(date => {
      ['lunch', 'dinner'].forEach(mealType => {
        if (groupedMealPlans[date][mealType]) {
          groupedMealPlans[date][mealType].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        }
      });
    });

    // 日付範囲を決定（時間によって変更）
    const dates = [];
    const now = new Date();
    const currentHour = now.getHours();
    
    // 21時以前は当日から1週間、以降は翌日から1週間
    const startOffset = currentHour < 21 ? 0 : 1;
    
    for (let i = startOffset; i < startOffset + 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      dates.push(date);
    }

    let mealPlansHtml = '';
    dates.forEach((date, index) => {
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const isToday = dateStr === today;
      const isTomorrow = dateStr === tomorrowStr;
      
      const dayMeals = groupedMealPlans[dateStr] || { lunch: [], dinner: [] };
      
      mealPlansHtml += `
        <div class="meal-plan-day ${isToday ? 'today' : ''} ${isTomorrow ? 'tomorrow' : ''}">
          <div class="day-header">
            <h3>${date.getMonth() + 1}/${date.getDate()} (${dayOfWeek})</h3>
            ${isToday ? '<span class="today-badge">今日</span>' : ''}
            ${isTomorrow ? '<span class="tomorrow-badge">翌日</span>' : ''}
          </div>
          <div class="day-meals">
            ${!this.hiddenMealSlots.has(`${dateStr}-lunch`) ? `
            <div class="meal-item">
              <div class="meal-header">
                <span class="meal-label">昼</span>
                <div class="meal-header-actions">
                  <button class="btn-icon" onclick="window.app.showMealModal('${dateStr}', 'lunch')" title="昼の献立を編集">✏️</button>
                  <button class="btn-icon delete-meal-type" onclick="window.app.deleteMealType('${dateStr}', 'lunch')" title="昼の献立を非表示にする（外食等）">🗑️</button>
                </div>
              </div>
              <div class="meal-content">
${this.renderMealTypeItems(dayMeals.lunch || [], dateStr, 'lunch')}
              </div>
            </div>` : ''}
            ${!this.hiddenMealSlots.has(`${dateStr}-dinner`) ? `
            <div class="meal-item">
              <div class="meal-header">
                <span class="meal-label">夜</span>
                <div class="meal-header-actions">
                  <button class="btn-icon" onclick="window.app.showMealModal('${dateStr}', 'dinner')" title="夜の献立を編集">✏️</button>
                  <button class="btn-icon delete-meal-type" onclick="window.app.deleteMealType('${dateStr}', 'dinner')" title="夜の献立を非表示にする（外食等）">🗑️</button>
                </div>
              </div>
              <div class="meal-content">
${this.renderMealTypeItems(dayMeals.dinner || [], dateStr, 'dinner')}
              </div>
            </div>` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = mealPlansHtml;
  }
  
  // 非表示にした献立枠を再表示する機能
  showMealType(date, mealType) {
    const slotKey = `${date}-${mealType}`;
    this.hiddenMealSlots.delete(slotKey);
    
    // ローカルストレージを更新
    localStorage.setItem('hiddenMealSlots', JSON.stringify([...this.hiddenMealSlots]));
    
    this.renderMealPlans();
  }

  renderMealTypeItems(mealPlans, date, mealType) {
    let html = '';
    
    // 既存のメニューを表示
    if (mealPlans && mealPlans.length > 0) {
      mealPlans.forEach(mealPlan => {
        html += `
          <div class="meal-plan-item" data-meal-id="${mealPlan.id}">
            <div class="meal-info">
              ${mealPlan.recipes ? 
                `<span class="meal-title">${this.escapeHtml(mealPlan.recipes.title)}</span>` : 
                '<span class="meal-title">レシピなし</span>'
              }
              ${mealPlan.recipes && mealPlan.recipes.cooking_time_minutes ? 
                `<div class="meal-cooking-time">⏱️ ${this.formatCookingTime(mealPlan.recipes.cooking_time_minutes)}</div>` : 
                ''
              }
              ${mealPlan.notes ? `<p class="meal-notes">${this.escapeHtml(mealPlan.notes)}</p>` : ''}
            </div>
            <div class="meal-actions">
              <button class="btn-icon" onclick="window.app.deleteMealPlan('${mealPlan.id}')" title="削除">🗑️</button>
            </div>
          </div>
        `;
      });
    }
    
    // 新しいメニューを追加するスロット（常に表示）
    html += `
      <div class="meal-plan-empty" data-date="${date}" data-meal-type="${mealType}">
        <div class="meal-slot">
          <button class="recipe-select" onclick="window.app.showMealModal('${date}', '${mealType}')">
            + レシピを追加
          </button>
        </div>
      </div>
    `;
    
    return html;
  }

  selectRecipe(date, mealType, recipeId, selectElement) {
    if (recipeId === '__ADD_NEW__') {
      // 新しいレシピを作成（献立情報を保存）
      this.pendingMealPlan = { date, mealType, selectElement };
      this.showRecipeModal();
      selectElement.selectedIndex = 0;
      return;
    }
    
    if (recipeId) {
      // レシピが選択された場合、すぐに保存
      const notesElement = selectElement.parentElement.querySelector('.meal-notes-input');
      const notes = notesElement ? notesElement.value.trim() : null;
      this.saveMealPlan(date, mealType, recipeId, notes);
      
      // 入力フィールドをリセット
      selectElement.selectedIndex = 0;
      if (notesElement) notesElement.value = '';
    }
  }

  saveMealFromSlot(date, mealType, notesElement) {
    const notes = notesElement.value.trim();
    if (notes) {
      // メモが入力された場合、保存
      const selectElement = notesElement.parentElement.querySelector('.recipe-select');
      const recipeId = selectElement && selectElement.value ? selectElement.value : null;
      this.saveMealPlan(date, mealType, recipeId, notes);
      
      // 入力フィールドをリセット
      notesElement.value = '';
      if (selectElement) selectElement.selectedIndex = 0;
    }
  }

  async saveMealPlan(date, mealType, recipeId, notes) {
    // レシピもメモも空の場合は保存しない
    if (!recipeId && (!notes || !notes.trim())) {
      return;
    }

    try {
      // 次の順序番号を取得
      const { data: existingMeals } = await supabaseClient
        .from('meal_plans')
        .select('sort_order')
        .eq('date', date)
        .eq('meal_type', mealType)
        .order('sort_order', { ascending: false })
        .limit(1);
      
      const nextSortOrder = existingMeals && existingMeals.length > 0 
        ? (existingMeals[0].sort_order || 0) + 1 
        : 0;

      const mealPlanData = {
        date: date,
        meal_type: mealType,
        recipe_id: recipeId || null,
        notes: notes && notes.trim() ? notes.trim() : null,
        user_id: this.currentUser.id,
        sort_order: nextSortOrder
      };

      const { error } = await supabaseClient
        .from('meal_plans')
        .insert(mealPlanData);

      if (error) throw error;
      
      this.showMessage('献立を追加しました', 'success');
      
      // データを再読み込みしてUIを更新
      await this.loadAppData();
      // 献立ビューを表示中の場合はレンダリングを更新
      if (this.currentView === 'calendar') {
        this.renderMealPlans();
      }

    } catch (error) {
      console.error('献立保存エラー:', error);
      this.showMessage('献立の保存に失敗しました', 'error');
    }
  }

  async editMealPlan(mealPlanId) {
    const mealPlan = this.mealPlans.find(mp => mp.id === mealPlanId);
    if (!mealPlan) {
      this.showMessage('献立が見つかりません', 'error');
      return;
    }
    
    // インライン編集モードに切り替え
    const mealElement = document.querySelector(`[data-meal-id="${mealPlanId}"]`);
    if (mealElement) {
      this.switchToEditMode(mealElement, mealPlan);
    }
  }

  switchToEditMode(element, mealPlan) {
    const mealInfo = element.querySelector('.meal-info');
    const recipeSelect = this.recipes.map(recipe => 
      `<option value="${recipe.id}" ${recipe.id === mealPlan.recipe_id ? 'selected' : ''}>
        ${this.escapeHtml(recipe.title)}
      </option>`
    ).join('');
    
    mealInfo.innerHTML = `
      <div class="meal-slot">
        <select class="recipe-select" onchange="window.app.updateMealPlan('${mealPlan.id}', this.value, null)">
          <option value="">レシピを選択</option>
          ${recipeSelect}
        </select>
        <textarea class="meal-notes-input" placeholder="メモを入力" 
                  onblur="window.app.updateMealPlan('${mealPlan.id}', null, this.value)">${mealPlan.notes || ''}</textarea>
        <div class="edit-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.app.cancelEdit('${mealPlan.id}')">キャンセル</button>
          <button class="btn btn-primary btn-sm" onclick="window.app.saveEdit('${mealPlan.id}')">保存</button>
        </div>
      </div>
    `;
  }

  async updateMealPlan(mealPlanId, recipeId, notes) {
    const updateData = {};
    if (recipeId !== null) updateData.recipe_id = recipeId || null;
    if (notes !== null) updateData.notes = notes && notes.trim() ? notes.trim() : null;

    try {
      const { error } = await supabaseClient
        .from('meal_plans')
        .update(updateData)
        .eq('id', mealPlanId);

      if (error) throw error;
      
      this.showMessage('献立を更新しました', 'success');
      await this.loadAppData();
      // 献立ビューを表示中の場合はレンダリングを更新
      if (this.currentView === 'calendar') {
        this.renderMealPlans();
      }
    } catch (error) {
      console.error('献立更新エラー:', error);
      this.showMessage('献立の更新に失敗しました', 'error');
    }
  }

  async saveEdit(mealPlanId) {
    const element = document.querySelector(`[data-meal-id="${mealPlanId}"]`);
    if (element) {
      const recipeSelect = element.querySelector('.recipe-select');
      const notesInput = element.querySelector('.meal-notes-input');
      
      const updateData = {};
      if (recipeSelect) updateData.recipe_id = recipeSelect.value || null;
      if (notesInput) updateData.notes = notesInput.value.trim() || null;

      try {
        const { error } = await supabaseClient
          .from('meal_plans')
          .update(updateData)
          .eq('id', mealPlanId);

        if (error) throw error;
        
        this.showMessage('献立を更新しました', 'success');
        await this.loadAppData();
        if (this.currentView === 'calendar') {
          this.renderMealPlans();
        }
      } catch (error) {
        console.error('献立更新エラー:', error);
        this.showMessage('献立の更新に失敗しました', 'error');
      }
    }
  }

  async cancelEdit(mealPlanId) {
    // キャンセル時は単純にデータを再読み込みして表示を戻す
    await this.loadAppData();
    if (this.currentView === 'calendar') {
      this.renderMealPlans();
    }
  }

  // 枠ごと非表示機能（外食等で献立不要な場合）
  async deleteMealType(date, mealType) {
    try {
      // まず既存の献立があれば削除
      const { error } = await supabaseClient
        .from('meal_plans')
        .delete()
        .eq('date', date)
        .eq('meal_type', mealType);
        
      if (error) throw error;
      
      // その後、その枠を非表示にする
      const slotKey = `${date}-${mealType}`;
      this.hiddenMealSlots.add(slotKey);
      
      // ローカルストレージに保存
      localStorage.setItem('hiddenMealSlots', JSON.stringify([...this.hiddenMealSlots]));
      
      await this.loadAppData();
      this.renderMealPlans();
    } catch (error) {
      console.error('献立削除エラー:', error);
      this.showMessage('献立の削除に失敗しました', 'error');
    }
  }

  async deleteMealPlan(mealPlanId) {
    try {
      const { error } = await supabaseClient
        .from('meal_plans')
        .delete()
        .eq('id', mealPlanId);
        
      if (error) throw error;
      
      await this.loadAppData();
      // 献立ビューを表示中の場合はレンダリングを更新
      if (this.currentView === 'calendar') {
        this.renderMealPlans();
      }
    } catch (error) {
      console.error('献立削除エラー:', error);
      this.showMessage('献立の削除に失敗しました', 'error');
    }
  }

  // ===== ユーティリティ =====
  getWeekStart() {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate());
    return start;
  }

  getWeekEnd() {
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + 7);
    return end;
  }

  getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  getMonthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 所要時間の表示用ヘルパー
  formatCookingTime(minutes) {
    const time = parseInt(minutes) || 15;
    if (time >= 75) {
      return '1時間以上';
    } else if (time >= 60) {
      const hours = Math.floor(time / 60);
      const mins = time % 60;
      if (mins === 0) {
        return `${hours}時間`;
      } else {
        return `${hours}時間${mins}分`;
      }
    } else {
      return `${time}分`;
    }
  }

  // ===== 献立モーダル関連 =====
  showMealModal(date, mealType, existingMealPlan = null) {
    const modal = document.getElementById('meal-modal');
    
    // 日付とメニュータイプを保存
    this.currentMealEdit = { date, mealType, existingMealPlan };
    
    // モーダルタイトルと日付情報を設定
    const dateObj = new Date(date);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
    const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${dayOfWeek})`;
    
    document.getElementById('meal-modal-date').textContent = formattedDate;
    document.getElementById('meal-modal-type').textContent = mealType === 'lunch' ? '昼' : '夜';
    document.getElementById('meal-modal-title').textContent = existingMealPlan ? 'レシピを変更' : 'レシピを選択';
    
    // 複数選択用の配列を初期化
    this.selectedRecipeIds = [];
    
    // 既存の献立情報を設定
    if (existingMealPlan) {
      document.getElementById('meal-modal-notes').value = existingMealPlan.notes || '';
      this.selectedRecipeIds = [existingMealPlan.recipe_id];
    } else {
      document.getElementById('meal-modal-notes').value = '';
      // 既存の献立一覧を取得して複数選択状態にする
      const existingMeals = this.mealPlans.filter(mp => mp.date === date && mp.meal_type === mealType);
      this.selectedRecipeIds = existingMeals.map(mp => mp.recipe_id);
    }
    
    // レシピオプションを表示
    this.renderRecipeOptions();
    this.renderSelectedRecipes();
    
    modal.classList.remove('hidden');
  }
  
  hideMealModal() {
    const modal = document.getElementById('meal-modal');
    modal.classList.add('hidden');
    
    // 検索をリセット
    document.getElementById('meal-recipe-search').value = '';
    this.renderRecipeOptions();
    
    this.currentMealEdit = null;
    this.selectedRecipeIds = [];
    this.renderSelectedRecipes();
  }
  
  renderRecipeOptions(searchTerm = '') {
    const container = document.getElementById('meal-recipe-options');
    
    // レシピをフィルタリング
    const filteredRecipes = this.recipes.filter(recipe => {
      if (!searchTerm) return true;
      return recipe.title.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    // 選択済みと未選択でソート
    const selectedRecipes = filteredRecipes.filter(recipe => 
      this.selectedRecipeIds.includes(recipe.id)
    );
    const unselectedRecipes = filteredRecipes.filter(recipe => 
      !this.selectedRecipeIds.includes(recipe.id)
    );
    const sortedRecipes = [...selectedRecipes, ...unselectedRecipes];
    
    let html = '';
    
    // 新規レシピ作成オプション
    const createFunction = searchTerm ? 
      `window.app.createNewRecipeFromSearch('${this.escapeHtml(searchTerm)}')` : 
      'window.app.createNewRecipeFromMeal()';
    
    html += `
      <div class="recipe-option new-recipe-option" onclick="${createFunction}">
        <div class="recipe-option-info">
          <div class="recipe-option-title">+ 新しいレシピを作成</div>
        </div>
      </div>
    `;
    
    // 既存レシピオプション（選択済みを上に表示）
    sortedRecipes.forEach(recipe => {
      const isSelected = this.selectedRecipeIds.includes(recipe.id);
      const tags = (recipe.recipe_tag_relations || []).map(rel => rel.recipe_tags);
      
      html += `
        <div class="recipe-option ${isSelected ? 'selected' : ''}" onclick="window.app.toggleRecipeSelection('${recipe.id}')">
          <div class="recipe-option-info">
            <div class="recipe-option-title">${this.escapeHtml(recipe.title)}</div>
            <div class="recipe-option-meta">
              <div class="recipe-option-time">
                <span>⏱️</span>
                <span>${this.formatCookingTime(recipe.cooking_time_minutes)}</span>
              </div>
              <div class="recipe-option-tags">
                ${tags.map(tag => 
                  `<span class="recipe-option-tag" style="background-color: ${tag.color}">${this.escapeHtml(tag.name)}</span>`
                ).join('')}
              </div>
            </div>
          </div>
          <div class="recipe-option-check">
            ${isSelected ? '✓' : ''}
          </div>
        </div>
      `;
    });
    
    if (sortedRecipes.length === 0 && searchTerm) {
      html += `
        <div class="no-results-section">
          <div class="no-results-message">
            <p>「${this.escapeHtml(searchTerm)}」に該当するレシピが見つかりません</p>
            <p class="search-suggestion">上の「新しいレシピを作成」からレシピを追加できます</p>
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
  }
  
  toggleRecipeSelection(recipeId) {
    const index = this.selectedRecipeIds.indexOf(recipeId);
    if (index > -1) {
      // 既に選択されている場合は削除
      this.selectedRecipeIds.splice(index, 1);
    } else {
      // 選択されていない場合は追加
      this.selectedRecipeIds.push(recipeId);
    }
    
    this.renderRecipeOptions(document.getElementById('meal-recipe-search').value);
    this.renderSelectedRecipes();
  }
  
  createNewRecipeFromMeal() {
    // 献立情報を保持したまま新しいレシピを作成
    this.pendingMealPlan = this.currentMealEdit;
    this.hideMealModal();
    this.showRecipeModal();
  }
  
  createNewRecipeFromSearch(searchTerm) {
    // 検索ワードをタイトルに設定してレシピ作成
    this.pendingMealPlan = this.currentMealEdit;
    this.pendingRecipeTitle = searchTerm;
    this.hideMealModal();
    this.showRecipeModal();
  }
  
  editMealPlanModal(mealPlanId, date, mealType) {
    // 既存の献立データを取得
    const existingMealPlan = this.mealPlans.find(mp => mp.id === mealPlanId);
    if (existingMealPlan) {
      this.showMealModal(date, mealType, existingMealPlan);
    }
  }
  
  async saveMealFromModal() {
    if (this.selectedRecipeIds.length === 0) {
      this.showMessage('レシピを選択してください', 'error');
      return;
    }
    
    const notes = document.getElementById('meal-modal-notes').value.trim();
    const { date, mealType, existingMealPlan } = this.currentMealEdit;
    
    try {
      if (existingMealPlan) {
        // 編集モードの場合は単一レシピのみ更新
        const { error } = await supabaseClient
          .from('meal_plans')
          .update({
            recipe_id: this.selectedRecipeIds[0],
            notes: notes || null
          })
          .eq('id', existingMealPlan.id);
          
        if (error) throw error;
        this.showMessage('献立を更新しました', 'success');
      } else {
        // 新規作成の場合は既存の献立を削除してから複数作成
        // まず既存の献立を削除
        const { error: deleteError } = await supabaseClient
          .from('meal_plans')
          .delete()
          .eq('date', date)
          .eq('meal_type', mealType);
          
        if (deleteError) throw deleteError;
        
        // 複数のレシピで献立を作成
        const mealPlansToInsert = this.selectedRecipeIds.map(recipeId => ({
          date,
          meal_type: mealType,
          recipe_id: recipeId,
          notes: notes || null,
          user_id: this.currentUser.id
        }));
        
        const { error: insertError } = await supabaseClient
          .from('meal_plans')
          .insert(mealPlansToInsert);
          
        if (insertError) throw insertError;
        
        this.showMessage(`${this.selectedRecipeIds.length}品の献立を保存しました`, 'success');
      }
      
      this.hideMealModal();
      await this.loadAppData();
      this.renderMealPlans();
      
    } catch (error) {
      console.error('献立保存エラー:', error);
      this.showMessage('献立の保存に失敗しました', 'error');
    }
  }
  
  renderSelectedRecipes() {
    const container = document.getElementById('selected-recipes');
    if (!container) return;
    
    if (this.selectedRecipeIds.length === 0) {
      container.innerHTML = '<p class="no-selection">選択されたレシピはありません</p>';
      return;
    }
    
    const selectedRecipes = this.recipes.filter(recipe => 
      this.selectedRecipeIds.includes(recipe.id)
    );
    
    let html = '<div class="selected-recipes-list">';
    selectedRecipes.forEach(recipe => {
      html += `
        <div class="selected-recipe-item">
          <span class="selected-recipe-title">${this.escapeHtml(recipe.title)}</span>
          <button class="btn-icon remove-selected" onclick="window.app.toggleRecipeSelection('${recipe.id}')" title="削除">×</button>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
  }

  showMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    
    container.appendChild(messageEl);
    
    setTimeout(() => {
      messageEl.classList.add('fade-out');
      setTimeout(() => {
        messageEl.remove();
      }, 300);
    }, 3000);
  }

  // ===== レシピ編集・削除機能 =====
  async editRecipe(recipeId) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) {
      this.showMessage('レシピが見つかりません', 'error');
      return;
    }
    
    // タグ情報を取得してからモーダル表示
    try {
      const { data: recipeWithTags, error } = await supabaseClient
        .from('recipes')
        .select(`
          *,
          recipe_tag_relations (
            recipe_tags (
              id, name, color
            )
          )
        `)
        .eq('id', recipeId)
        .single();
      
      if (error) throw error;
      
      this.showRecipeModal(recipeWithTags);
    } catch (error) {
      console.error('レシピ編集エラー:', error);
      this.showMessage('レシピの読み込みに失敗しました', 'error');
    }
  }
  
  async deleteRecipe(recipeId) {
    if (!confirm('このレシピを削除しますか？')) {
      return;
    }
    
    try {
      // タグ関連も自動で削除される（ON DELETE CASCADE）
      const { error } = await supabaseClient
        .from('recipes')
        .delete()
        .eq('id', recipeId);
      
      if (error) throw error;
      
      // リアルタイム更新：リストから削除
      this.recipes = this.recipes.filter(r => r.id !== recipeId);
      this.renderRecipes();
      
      this.showMessage('レシピを削除しました', 'success');
    } catch (error) {
      console.error('レシピ削除エラー:', error);
      this.showMessage('レシピの削除に失敗しました', 'error');
    }
  }

  // ===== タグ管理機能 =====
  async addNewTag() {
    const nameInput = document.getElementById('new-tag-name');
    const tagName = nameInput.value.trim();
    
    if (!tagName) {
      this.showMessage('タグ名を入力してください', 'error');
      return;
    }
    
    if (this.tags.some(tag => tag.name === tagName)) {
      this.showMessage('同じ名前のタグが既に存在します', 'error');
      return;
    }
    
    try {
      const colors = ['#4F8BE8', '#E85A4F', '#28A745', '#6F42C1', '#FD7E14', '#20C997'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      const { data: newTag, error } = await supabaseClient
        .from('recipe_tags')
        .insert({
          user_id: this.currentUser.id,
          name: tagName,
          color: randomColor
        })
        .select()
        .single();
        
      if (error) throw error;
      
      // リアルタイム更新
      this.tags.push(newTag);
      this.renderTagCheckboxes();
      this.renderTagFilters();
      
      nameInput.value = '';
      this.showMessage('タグを追加しました', 'success');
    } catch (error) {
      console.error('タグ追加エラー:', error);
      this.showMessage('タグの追加に失敗しました', 'error');
    }
  }
  
  async deleteTag(tagId) {
    if (!confirm('このタグを削除しますか？関連付けられたレシピからも削除されます。')) {
      return;
    }
    
    try {
      // タグ関連付けも自動で削除される（ON DELETE CASCADE）
      const { error } = await supabaseClient
        .from('recipe_tags')
        .delete()
        .eq('id', tagId);
        
      if (error) throw error;
      
      // リアルタイム更新
      this.tags = this.tags.filter(tag => tag.id !== tagId);
      this.renderTagCheckboxes();
      this.renderTagFilters();
      
      this.showMessage('タグを削除しました', 'success');
    } catch (error) {
      console.error('タグ削除エラー:', error);
      this.showMessage('タグの削除に失敗しました', 'error');
    }
  }

  async updateTagName(tagId, newName) {
    const trimmedName = newName.trim();
    
    if (!trimmedName) {
      this.showMessage('タグ名を空にはできません', 'error');
      this.renderTagCheckboxes(); // 元に戻す
      return;
    }
    
    // 同じ名前のタグが既に存在するかチェック（自身は除く）
    if (this.tags.some(tag => tag.name === trimmedName && tag.id !== tagId)) {
      this.showMessage('同じ名前のタグが既に存在します', 'error');
      this.renderTagCheckboxes(); // 元に戻す
      return;
    }
    
    try {
      const { error } = await supabaseClient
        .from('recipe_tags')
        .update({ name: trimmedName })
        .eq('id', tagId);
        
      if (error) throw error;
      
      // リアルタイム更新
      const tagIndex = this.tags.findIndex(tag => tag.id === tagId);
      if (tagIndex !== -1) {
        this.tags[tagIndex].name = trimmedName;
        this.renderTagFilters();
      }
      
      this.showMessage('タグ名を更新しました', 'success');
    } catch (error) {
      console.error('タグ名更新エラー:', error);
      this.showMessage('タグ名の更新に失敗しました', 'error');
      this.renderTagCheckboxes(); // 元に戻す
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
