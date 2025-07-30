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
      this.currentUser = await this.authManager.ensureUserProfile();
      if (!this.currentUser) {
        throw new Error('ユーザープロファイルの作成に失敗しました');
      }

      // ペアリング状態確認
      const pairingStatus = await this.authManager.checkPairingStatus();
      
      if (pairingStatus?.paired_with) {
        // ペア済み - メインアプリを表示
        await this.loadAppData();
        this.showScreen('main');
      } else {
        // 未ペア - ペアリング画面を表示
        this.showScreen('pairing');
      }

    } catch (error) {
      console.error('認証・ペアリング確認エラー:', error);
      this.showMessage('認証エラーが発生しました', 'error');
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

    // 献立関連
    document.getElementById('add-meal-plan-btn')?.addEventListener('click', () => this.showMealPlanModal());
    document.getElementById('close-meal-plan-modal')?.addEventListener('click', () => this.hideMealPlanModal());
    document.getElementById('cancel-meal-plan')?.addEventListener('click', () => this.hideMealPlanModal());
    document.getElementById('save-meal-plan')?.addEventListener('click', () => this.saveMealPlan());

    // モーダル外クリックで閉じる
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideRecipeModal();
        this.hideMealPlanModal();
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
      this.renderMealPlans();
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
      // 並列でデータを取得
      const [recipes, tags, mealPlans] = await Promise.all([
        DatabaseHelper.getRecipes(),
        DatabaseHelper.getTags(),
        DatabaseHelper.getMealPlans(
          this.getWeekStart().toISOString().split('T')[0],
          this.getWeekEnd().toISOString().split('T')[0]
        )
      ]);

      this.recipes = recipes;
      this.tags = tags;
      this.mealPlans = mealPlans;

      // UI更新
      this.renderRecipes();
      this.renderTagFilters();

    } catch (error) {
      console.error('データ読み込みエラー:', error);
      this.showMessage('データの読み込みに失敗しました', 'error');
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
      
      if (this.editingRecipeId) {
        // 編集の場合は全データを再読み込み
        await this.loadAppData();
      } else {
        // 新規作成の場合はリアルタイム更新
        this.recipes.unshift(savedRecipe);
        this.renderRecipes();
        this.renderTagFilters();
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
    
    if (this.mealPlans.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>まだ献立がありません</p>
          <p>今週の献立を追加してみましょう！</p>
        </div>
      `;
      return;
    }

    // 日付でグループ化
    const groupedMealPlans = {};
    this.mealPlans.forEach(mp => {
      if (!groupedMealPlans[mp.date]) {
        groupedMealPlans[mp.date] = {};
      }
      groupedMealPlans[mp.date][mp.meal_type] = mp;
    });

    // 今日から1週間分の日付を生成
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }

    let mealPlansHtml = '';
    dates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
      const isToday = dateStr === today.toISOString().split('T')[0];
      
      const dayMeals = groupedMealPlans[dateStr] || {};
      
      mealPlansHtml += `
        <div class="meal-plan-day ${isToday ? 'today' : ''}">
          <div class="day-header">
            <h3>${date.getMonth() + 1}/${date.getDate()} (${dayOfWeek})</h3>
            ${isToday ? '<span class="today-badge">今日</span>' : ''}
          </div>
          <div class="day-meals">
            <div class="meal-item">
              <span class="meal-label">昼</span>
              <div class="meal-content">
                ${this.renderMealPlanItem(dayMeals.lunch, dateStr, 'lunch')}
              </div>
            </div>
            <div class="meal-item">
              <span class="meal-label">夜</span>
              <div class="meal-content">
                ${this.renderMealPlanItem(dayMeals.dinner, dateStr, 'dinner')}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = mealPlansHtml;
  }

  renderMealPlanItem(mealPlan, date, mealType) {
    if (mealPlan) {
      return `
        <div class="meal-plan-item">
          <div class="meal-info">
            ${mealPlan.recipes ? 
              `<span class="meal-title">${this.escapeHtml(mealPlan.recipes.title)}</span>` : 
              '<span class="meal-title">レシピなし</span>'
            }
            ${mealPlan.notes ? `<p class="meal-notes">${this.escapeHtml(mealPlan.notes)}</p>` : ''}
          </div>
          <div class="meal-actions">
            <button class="btn-icon" onclick="window.app.editMealPlan('${mealPlan.id}')" title="編集">✏️</button>
            <button class="btn-icon" onclick="window.app.deleteMealPlan('${mealPlan.id}')" title="削除">🗑️</button>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="meal-plan-empty" onclick="window.app.addMealPlan('${date}', '${mealType}')">
          <span>+ 献立を追加</span>
        </div>
      `;
    }
  }

  showMealPlanModal(mealPlan = null, date = null, mealType = null) {
    const modal = document.getElementById('meal-plan-modal');
    const form = document.getElementById('meal-plan-form');
    
    // 編集中の献立IDを保存
    this.editingMealPlanId = mealPlan ? mealPlan.id : null;
    
    if (mealPlan) {
      // 編集モード
      document.getElementById('meal-plan-modal-title').textContent = '献立編集';
      document.getElementById('meal-plan-date').value = mealPlan.date;
      document.getElementById('meal-plan-type').value = mealPlan.meal_type;
      document.getElementById('meal-plan-recipe').value = mealPlan.recipe_id || '';
      document.getElementById('meal-plan-notes').value = mealPlan.notes || '';
    } else {
      // 新規追加モード
      document.getElementById('meal-plan-modal-title').textContent = '献立追加';
      form.reset();
      if (date) document.getElementById('meal-plan-date').value = date;
      if (mealType) document.getElementById('meal-plan-type').value = mealType;
    }

    this.renderRecipeOptions();
    modal.classList.remove('hidden');
  }

  hideMealPlanModal() {
    document.getElementById('meal-plan-modal').classList.add('hidden');
  }

  renderRecipeOptions() {
    const select = document.getElementById('meal-plan-recipe');
    let optionsHtml = '<option value="">レシピを選択（任意）</option>';
    
    this.recipes.forEach(recipe => {
      optionsHtml += `<option value="${recipe.id}">${this.escapeHtml(recipe.title)}</option>`;
    });
    
    select.innerHTML = optionsHtml;
  }

  addMealPlan(date, mealType) {
    this.showMealPlanModal(null, date, mealType);
  }

  async saveMealPlan() {
    const form = document.getElementById('meal-plan-form');
    const formData = new FormData(form);

    const mealPlanData = {
      date: document.getElementById('meal-plan-date').value,
      meal_type: document.getElementById('meal-plan-type').value,
      recipe_id: document.getElementById('meal-plan-recipe').value || null,
      notes: document.getElementById('meal-plan-notes').value || null,
      user_id: this.currentUser.id
    };

    if (!mealPlanData.date || !mealPlanData.meal_type) {
      this.showMessage('日付と食事を選択してください', 'error');
      return;
    }

    try {
      if (this.editingMealPlanId) {
        // 編集モード
        const { error } = await supabaseClient
          .from('meal_plans')
          .update(mealPlanData)
          .eq('id', this.editingMealPlanId);

        if (error) throw error;

        this.showMessage('献立を更新しました', 'success');
      } else {
        // 新規作成モード
        const { error } = await supabaseClient
          .from('meal_plans')
          .insert(mealPlanData);

        if (error) throw error;

        this.showMessage('献立を追加しました', 'success');
      }

      this.hideMealPlanModal();
      await this.loadAppData();
      this.editingMealPlanId = null;

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
    
    this.showMealPlanModal(mealPlan);
  }

  async deleteMealPlan(mealPlanId) {
    if (!confirm('この献立を削除しますか？')) {
      return;
    }
    
    try {
      const { error } = await supabaseClient
        .from('meal_plans')
        .delete()
        .eq('id', mealPlanId);
        
      if (error) throw error;
      
      this.showMessage('献立を削除しました', 'success');
      await this.loadAppData();
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
