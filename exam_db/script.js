// Конфигурация
const CONFIG_URL = './config.json'; // Путь к вашему конфигу
const GITHUB_API_BASE = 'https://api.github.com';
// ВНИМАНИЕ: Для большего лимита запросов создайте Personal Access Token
// const GITHUB_TOKEN = 'ваш_токен_здесь'; // Раскомментируйте и используйте, если упретесь в лимиты

// Кэш для данных, чтобы не делать лишние запросы
let studentsDataCache = [];
let allLanguages = new Set();

// DOM элементы
const studentsContainer = document.getElementById('studentsContainer');
const searchInput = document.getElementById('searchInput');
const languageFilter = document.getElementById('languageFilter');
const totalStudentsEl = document.getElementById('totalStudents');
const totalCommitsEl = document.getElementById('totalCommits');
const totalIssuesEl = document.getElementById('totalIssues');
const totalLanguagesEl = document.getElementById('totalLanguages');
const lastUpdateEl = document.getElementById('lastUpdate');
const orgLink = document.getElementById('orgLink');

// Главная функция инициализации
async function initDashboard() {
    try {
        // 1. Загружаем конфигурацию студентов
        const config = await loadConfig();
        totalStudentsEl.textContent = config.length;

        // 2. Параллельно загружаем данные для всех студентов
        const loadingPromises = config.map(student => fetchStudentData(student));
        const studentsData = await Promise.all(loadingPromises);

        // 3. Сохраняем данные в кэш и отображаем
        studentsDataCache = studentsData.filter(data => data !== null);
        renderStudents(studentsDataCache);
        updateDashboardStats(studentsDataCache);
        updateLanguageFilter();
        initScrollButtons();

        // 4. Обновляем время и ссылку
        lastUpdateEl.textContent = new Date().toLocaleString('ru-RU');
        if (config.length > 0) {
            orgLink.href = `https://github.com/${config[0].githubUsername.split('/')[0]}`;
        }

    } catch (error) {
        console.error('Ошибка при инициализации:', error);
        studentsContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Не удалось загрузить данные</h3>
                <p>Проверьте конфигурационный файл и подключение к сети.</p>
                <button onclick="location.reload()">Попробовать снова</button>
            </div>
        `;
    }
}

// Загрузка конфигурационного файла
async function loadConfig() {
    const response = await fetch(CONFIG_URL);
    if (!response.ok) throw new Error(`Не удалось загрузить конфиг: ${response.status}`);
    return await response.json();
}

// Сбор всех данных по одному студенту
async function fetchStudentData(studentConfig) {
    try {
        const [userData, repoData, languages, commits, issues] = await Promise.all([
            fetchFromGitHub(`/users/${studentConfig.githubUsername}`),
            fetchFromGitHub(`/repos/${studentConfig.githubUsername}/${studentConfig.repoName}`),
            fetchFromGitHub(`/repos/${studentConfig.githubUsername}/${studentConfig.repoName}/languages`),
            fetchFromGitHub(`/repos/${studentConfig.githubUsername}/${studentConfig.repoName}/commits?per_page=100`),
            fetchFromGitHub(`/repos/${studentConfig.githubUsername}/${studentConfig.repoName}/issues?state=all`)
        ]);

        // Собираем языки для фильтра
        Object.keys(languages).forEach(lang => allLanguages.add(lang));

        return {
            config: studentConfig,
            user: userData,
            repo: repoData,
            languages: languages,
            commitCount: Array.isArray(commits) ? commits.length : 0,
            issuesCount: Array.isArray(issues) ? issues.length : 0,
            hasReadme: repoData.has_wiki || repoData.has_pages // Простая проверка
        };
    } catch (error) {
        console.error(`Ошибка загрузки данных для ${studentConfig.name}:`, error);
        return null;
    }
}

// Универсальный метод запроса к GitHub API
async function fetchFromGitHub(endpoint) {
    const url = `${GITHUB_API_BASE}${endpoint}`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        // 'Authorization': `token ${GITHUB_TOKEN}` // Раскомментируйте при использовании токена
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`GitHub API: ${response.status} для ${endpoint}`);
    }
    return await response.json();
}

// Отрисовка всех карточек студентов
function renderStudents(studentsData) {
    if (studentsData.length === 0) {
        studentsContainer.innerHTML = '<div class="no-results">По вашему запросу студентов не найдено.</div>';
        return;
    }

    // Сначала определяем ранги для всех студентов
    const studentsWithRanks = studentsData.map(student => {
        const rank = calculateStudentRank(student, studentsData);
        return { ...student, rank };
    });

    studentsContainer.innerHTML = studentsWithRanks.map(student => {
        const rankBadge = getRankBadge(student.rank);
        
        return `
        <div class="student-card" data-languages="${Object.keys(student.languages).join(',')}">
            <!-- Бейдж ранга в правом верхнем углу -->
            <div class="rank-badge" style="background: ${rankBadge.color}">
                ${rankBadge.icon} ${rankBadge.name}
            </div>
            
            <div class="card-header">
                <div class="avatar-container">
                    <img src="${student.user.avatar_url}" alt="${student.user.login}" class="avatar">
                </div>
                <div class="student-info">
                    <h2>${student.config.name}</h2>
                    <a href="${student.user.html_url}" target="_blank" class="github-link">
                        <i class="fab fa-github"></i> @${student.user.login}
                    </a>
                    <div class="status-indicator ${getStatusColor(student.commitCount)}">
                        <i class="fas fa-circle"></i> ${getStatusText(student.commitCount)}
                    </div>
                </div>
            </div>

            <div class="project-info">
                <h3><i class="fas fa-project-diagram"></i> ${student.repo.name}</h3>
                <p class="repo-description">${student.repo.description || 'Без описания'}</p>
                
                <div class="metrics-grid">
                    <div class="metric">
                        <i class="fas fa-code-commit"></i>
                        <div class="metric-content">
                            <strong>${student.commitCount}</strong>
                            <span>Коммиты</span>
                        </div>
                    </div>
                    <div class="metric">
                        <i class="fas fa-exclamation-circle"></i>
                        <div class="metric-content">
                            <strong>${student.issuesCount}</strong>
                            <span>Issues</span>
                        </div>
                    </div>
                    <div class="metric">
                        <i class="fas fa-book"></i>
                        <div class="metric-content">
                            <strong>${student.hasReadme ? '✅' : '❌'}</strong>
                            <span>README</span>
                        </div>
                    </div>
                    <div class="metric">
                        <i class="fas fa-code"></i>
                        <div class="metric-content">
                            <strong>${Object.keys(student.languages).length}</strong>
                            <span>Языки</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card-footer">
                <div class="updated-at">
                    <i class="far fa-clock"></i>
                    ${new Date(student.repo.updated_at).toLocaleDateString('ru-RU')}
                </div>
                <a href="${student.repo.html_url}" target="_blank" class="repo-link">
                    <i class="fas fa-external-link-alt"></i> Репозиторий
                </a>
            </div>
        </div>
        `;
    }).join('');
}

// Вспомогательные функции
function getStatusColor(commitCount) {
    if (commitCount > 50) return 'status-high';
    if (commitCount > 20) return 'status-medium';
    return 'status-low';
}

function getStatusText(commitCount) {
    if (commitCount > 50) return 'Высокая активность';
    if (commitCount > 20) return 'Средняя активность';
    return 'Начальный этап';
}

function getLanguageSize(bytes) {
    if (bytes > 100000) return 'lg';
    if (bytes > 10000) return 'md';
    return 'sm';
}

function updateDashboardStats(data) {
    totalCommitsEl.textContent = data.reduce((sum, student) => sum + student.commitCount, 0);
    totalIssuesEl.textContent = data.reduce((sum, student) => sum + student.issuesCount, 0);
    totalLanguagesEl.textContent = allLanguages.size;
}

function updateLanguageFilter() {
    const sortedLanguages = Array.from(allLanguages).sort();
    languageFilter.innerHTML = `
        <option value="">Все языки</option>
        ${sortedLanguages.map(lang => `<option value="${lang}">${lang}</option>`).join('')}
    `;
}

// Функции фильтрации и поиска
function filterStudents() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedLanguage = languageFilter.value;

    const filtered = studentsDataCache.filter(student => {
        const matchesSearch = student.config.name.toLowerCase().includes(searchTerm) ||
                             student.config.repoName.toLowerCase().includes(searchTerm) ||
                             student.user.login.toLowerCase().includes(searchTerm);
        const matchesLanguage = !selectedLanguage ||
                               Object.keys(student.languages).includes(selectedLanguage);
        return matchesSearch && matchesLanguage;
    });

    renderStudents(filtered);
}

//для определения ранга студента
function calculateStudentRank(student, allStudents) {
    // Баллы: коммиты (40%), issues (20%), звезды (20%), наличие README (10%), языки (10%)
    const score = student.commitCount * 0.4 + 
                  student.issuesCount * 0.2 + 
                  student.repo.stargazers_count * 0.2 + 
                  (student.hasReadme ? 10 : 0) + 
                  (Object.keys(student.languages).length * 2);
    
    // Сортируем всех студентов по баллам
    const sortedStudents = [...allStudents].sort((a, b) => {
        const scoreA = a.commitCount * 0.4 + a.issuesCount * 0.2 + a.repo.stargazers_count * 0.2 + (a.hasReadme ? 10 : 0) + (Object.keys(a.languages).length * 2);
        const scoreB = b.commitCount * 0.4 + b.issuesCount * 0.2 + b.repo.stargazers_count * 0.2 + (b.hasReadme ? 10 : 0) + (Object.keys(b.languages).length * 2);
        return scoreB - scoreA;
    });
    
    // Определяем позицию студента
    const position = sortedStudents.findIndex(s => s.config.githubUsername === student.config.githubUsername);
    
    // Распределяем ранги
    if (position === 0) return 'teamlead';
    if (position === 1) return 'senior';
    if (position >= 2 && position <= 3) return 'mid';
    if (position >= 4 && position <= 8) return 'junior';
    return 'trainee';
}

function getRankBadge(rank) {
    const badges = {
        'teamlead': { name: 'Тимлид', color: '#FF6B6B', icon: '👑' },
        'senior': { name: 'Сеньер', color: '#4ECDC4', icon: '⭐' },
        'mid': { name: 'Мидл', color: '#45B7D1', icon: '⚡' },
        'junior': { name: 'Джун', color: '#96CEB4', icon: '🚀' },
        'trainee': { name: 'Стажер', color: '#FFEAA7', icon: '🌱' }
    };
    return badges[rank] || badges['trainee'];
}

// Добавьте в конец script.js

// Функции для скролла
function initScrollButtons() {
    const container = document.querySelector('.students-container');
    const leftBtn = document.querySelector('.scroll-left');
    const rightBtn = document.querySelector('.scroll-right');
    
    if (!container || !leftBtn || !rightBtn) return;
    
    leftBtn.addEventListener('click', () => {
        container.scrollBy({ left: -300, behavior: 'smooth' });
    });
    
    rightBtn.addEventListener('click', () => {
        container.scrollBy({ left: 300, behavior: 'smooth' });
    });
    
    // Обновляем видимость кнопок при скролле
    container.addEventListener('scroll', () => {
        const scrollLeft = container.scrollLeft;
        const maxScroll = container.scrollWidth - container.clientWidth;
        
        leftBtn.style.opacity = scrollLeft > 0 ? '1' : '0.5';
        rightBtn.style.opacity = scrollLeft < maxScroll - 10 ? '1' : '0.5';
    });
}


// Слушатели событий
searchInput.addEventListener('input', filterStudents);
languageFilter.addEventListener('change', filterStudents);

// Запуск приложения
document.addEventListener('DOMContentLoaded', initDashboard);