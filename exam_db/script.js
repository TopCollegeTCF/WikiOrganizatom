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

    studentsContainer.innerHTML = studentsData.map(student => `
        <div class="student-card" data-languages="${Object.keys(student.languages).join(',')}">
            <div class="card-header">
                <img src="${student.user.avatar_url}" alt="${student.user.login}" class="avatar">
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
                <h3><i class="fas fa-project-diagram"></i> Проект</h3>
                <a href="${student.repo.html_url}" target="_blank" class="repo-link">
                    ${student.repo.name}
                </a>
                <p class="repo-description">${student.repo.description || 'Описание отсутствует'}</p>

                // Замените блок .metrics-grid в renderStudents на этот:
<div class="metrics-grid">
    <div class="metric">
        <div class="metric-header">
            <i class="fas fa-code-commit"></i>
            <div class="metric-value">${student.commitCount}</div>
        </div>
        <div class="metric-label">Коммитов</div>
        <div class="metric-bar">
            <div class="metric-fill" style="width: ${Math.min(student.commitCount, 100)}%"></div>
        </div>
    </div>
    <div class="metric">
        <div class="metric-header">
            <i class="fas fa-exclamation-circle"></i>
            <div class="metric-value">${student.issuesCount}</div>
        </div>
        <div class="metric-label">Issues</div>
        <div class="metric-bar">
            <div class="metric-fill" style="width: ${Math.min(student.issuesCount * 10, 100)}%"></div>
        </div>
    </div>
    <div class="metric">
        <div class="metric-header">
            <i class="fas fa-book"></i>
            <div class="metric-value">${student.hasReadme ? '✅' : '❌'}</div>
        </div>
        <div class="metric-label">README.md</div>
        <div class="metric-bar">
            <div class="metric-fill" style="width: ${student.hasReadme ? 100 : 0}%"></div>
        </div>
    </div>
    <div class="metric">
        <div class="metric-header">
            <i class="fas fa-star"></i>
            <div class="metric-value">${student.repo.stargazers_count}</div>
        </div>
        <div class="metric-label">Звезд</div>
        <div class="metric-bar">
            <div class="metric-fill" style="width: ${Math.min(student.repo.stargazers_count * 20, 100)}%"></div>
        </div>
    </div>
</div>

// И добавьте после блока .metrics-grid:
<div class="language-chart">
    ${Object.entries(student.languages)
        .slice(0, 6) // Показываем топ-6 языков
        .map(([lang, bytes]) => `
            <div class="language-bar" 
                 style="height: ${Math.min(bytes / 1000, 100)}%"
                 data-lang="${lang}"
                 title="${lang}: ${bytes} байт">
            </div>
        `).join('')}
</div>
            </div>

            <div class="languages-section">
                <h4><i class="fas fa-code"></i> Используемые языки</h4>
                <div class="language-badges">
                    ${Object.entries(student.languages)
                        .map(([lang, bytes]) => `
                            <span class="language-badge" style="--size: ${getLanguageSize(bytes)}">
                                ${lang}
                            </span>
                        `).join('')}
                </div>
            </div>

            <div class="card-footer">
                <div class="footer-links">
                    <a href="${student.repo.html_url}/issues" target="_blank">
                        <i class="fas fa-tasks"></i> Issues
                    </a>
                    <a href="${student.repo.html_url}/pulls" target="_blank">
                        <i class="fas fa-code-pull-request"></i> Pull Requests
                    </a>
                    ${student.repo.homepage ? `
                    <a href="${student.repo.homepage}" target="_blank">
                        <i class="fas fa-external-link-alt"></i> Демо
                    </a>` : ''}
                </div>
                <span class="updated-at">
                    <i class="far fa-clock"></i>
                    Обновлено: ${new Date(student.repo.updated_at).toLocaleDateString('ru-RU')}
                </span>
            </div>
        </div>
    `).join('');
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

// Слушатели событий
searchInput.addEventListener('input', filterStudents);
languageFilter.addEventListener('change', filterStudents);

// Запуск приложения
document.addEventListener('DOMContentLoaded', initDashboard);
