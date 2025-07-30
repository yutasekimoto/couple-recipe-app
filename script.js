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

    // 検索
    document.getElementById('recipe-search')?.addEventListener('input', (e) => {
      this.filterRecipes(e.target.value);
    });

    // カレンダーナビゲーション
    document.getElementById('prev-month')?.addEventListener('click', () => this.navigateMonth(-1));
    document.getElementById('next-month')?.addEventListener('click', () => this.navigateMonth(1));

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
      this.renderCalendar();
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
          this.getMonthStart(this.currentMonth).toISOString().split('T')[0],
          this.getMonthEnd(this.currentMonth).toISOString().split('T')[0]
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
    
    if (recipe) {
      // 編集モード
      document.getElementById('recipe-modal-title').textContent = 'レシピ編集';
      document.getElementById('recipe-title').value = recipe.title || '';
      document.getElementById('recipe-url').value = recipe.recipe_url || '';
      document.getElementById('recipe-description').value = recipe.description || '';
      document.getElementById('cooking-time').value = recipe.cooking_time || '';
      document.getElementById('servings').value = recipe.servings || 2;
    } else {
      // 新規追加モード
      document.getElementById('recipe-modal-title').textContent = 'レシピ追加';
      form.reset();
      document.getElementById('servings').value = 2;
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
      cooking_time: parseInt(document.getElementById('cooking-time').value) || null,
      servings: parseInt(document.getElementById('servings').value) || 2,
      user_id: this.currentUser.id
    };

    if (!recipeData.title.trim()) {
      this.showMessage('レシピ名を入力してください', 'error');
      return;
    }

    try {
      // レシピ保存
      const { data: savedRecipe, error } = await supabaseClient
        .from('recipes')
        .insert(recipeData)
        .select()
        .single();

      if (error) throw error;

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
      this.showMessage('レシピを保存しました', 'success');
      await this.loadAppData();

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
          ${recipe.cooking_time ? `<span class="meta-item">⏱️ ${recipe.cooking_time}分</span>` : ''}
          ${recipe.servings ? `<span class="meta-item">👥 ${recipe.servings}人分</span>` : ''}
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
        <label class="checkbox-label">
          <input type="checkbox" value="${tag.id}" ${isChecked ? 'checked' : ''}>
          <span class="checkbox-text" style="color: ${tag.color}">
            ${this.escapeHtml(tag.name)}
          </span>
        </label>
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

  // ===== カレンダー機能 =====
  renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthSpan = document.getElementById('current-month');
    
    monthSpan.textContent = `${this.currentMonth.getFullYear()}年${this.currentMonth.getMonth() + 1}月`;
    
    const firstDay = this.getMonthStart(this.currentMonth);
    const lastDay = this.getMonthEnd(this.currentMonth);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // 週の始まり（日曜日）に調整
    
    let calendarHtml = `
      <div class="calendar-header">
        <div class="calendar-day-header">日</div>
        <div class="calendar-day-header">月</div>
        <div class="calendar-day-header">火</div>
        <div class="calendar-day-header">水</div>
        <div class="calendar-day-header">木</div>
        <div class="calendar-day-header">金</div>
        <div class="calendar-day-header">土</div>
      </div>
    `;
    
    const currentDate = new Date(startDate);
    
    for (let week = 0; week < 6; week++) {
      calendarHtml += '<div class="calendar-week">';
      
      for (let day = 0; day < 7; day++) {
        const isCurrentMonth = currentDate.getMonth() === this.currentMonth.getMonth();
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayMealPlans = this.mealPlans.filter(mp => mp.date === dateStr);
        
        calendarHtml += `
          <div class="calendar-day ${isCurrentMonth ? '' : 'other-month'}" data-date="${dateStr}">
            <div class="day-number">${currentDate.getDate()}</div>
            <div class="day-meals">
              <div class="meal-slot" data-meal="lunch">
                <span class="meal-label">昼</span>
                ${this.renderMealSlot(dayMealPlans.find(mp => mp.meal_type === 'lunch'))}
              </div>
              <div class="meal-slot" data-meal="dinner">
                <span class="meal-label">夜</span>
                ${this.renderMealSlot(dayMealPlans.find(mp => mp.meal_type === 'dinner'))}
              </div>
            </div>
          </div>
        `;
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      calendarHtml += '</div>';
      
      if (currentDate > lastDay) break;
    }
    
    grid.innerHTML = calendarHtml;
  }

  renderMealSlot(mealPlan) {
    if (mealPlan?.recipes) {
      return `
        <div class="meal-content">
          <span class="meal-title">${this.escapeHtml(mealPlan.recipes.title)}</span>
        </div>
      `;
    }
    return '<div class="meal-empty">+</div>';
  }

  navigateMonth(direction) {
    this.currentMonth.setMonth(this.currentMonth.getMonth() + direction);
    this.renderCalendar();
  }

  // ===== ユーティリティ =====
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
