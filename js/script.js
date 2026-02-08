// Global state
const state = {
    // API Endpoints
    apiEndpoint: 'https://script.google.com/macros/s/AKfycbwE4C6Uqfa33TFIl2HYZYYnsNH3R2AvkcE0ySRcleE7BxsU94tUNs3RGRTeGNLN7Rl52A/exec',
    data: {
        charaDB: [],
        jobIcon: [],
        iconAtt: []
    },
    filters: {
        charName: '',
        cv: '',
        rarity: '',
        job: '',
        element: '',
        type: '',
        class: '',
        category: '',
        era: '',
        gc: ''
    }
};

// DOM Elements
const elements = {
    searchFilters: document.getElementById('searchFilters'),
    tableBody: document.getElementById('charTableBody'),
    resultCount: document.getElementById('resultCount'),
    loadingMsg: document.getElementById('loadingMsg'),
    errorMsg: document.getElementById('errorMsg'),
    noResultMsg: document.getElementById('noResultMsg'),
    filterInputs: {
        charName: document.getElementById('filter-charName'),
        cv: document.getElementById('filter-cv'),
        rarity: document.getElementById('filter-rarity'),
        job: document.getElementById('filter-job'),
        element: document.getElementById('filter-element'),
        type: document.getElementById('filter-type'),
        class: document.getElementById('filter-class'),
        category: document.getElementById('filter-category'),
        era: document.getElementById('filter-era'),
        gc: document.getElementById('filter-gc'),
    }
};

// --- Data Fetching ---
async function fetchData() {
    try {
        elements.loadingMsg.classList.remove('hidden');
        elements.errorMsg.classList.add('hidden');
        elements.tableBody.innerHTML = '';

        console.log('Fetching data from:', state.apiEndpoint);

        // Fetch all 3 sheets in parallel
        // Assuming the API accepts ?sheet=SHEET_NAME parameter
        const sheetsToCheck = ['chara_DB', 'job_icon', 'icon_att'];
        const requests = sheetsToCheck.map(sheetName => {
            const url = `${state.apiEndpoint}?sheet=${sheetName}`;
            return fetch(url).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch ${sheetName}: ${res.status}`);
                return res.json().then(data => ({ sheet: sheetName, data }));
            });
        });

        const results = await Promise.all(requests);
        console.log('API Responses:', results);

        let charaDB = [], jobIcon = [], iconAtt = [];

        results.forEach(result => {
            const data = result.data;
            // The API might return the array directly, or an object wrapping it.
            // Based on previous logs, it seems sensitive to parameters.

            // Normalize: If data is object with values that are array, try to find the array.
            // But if we requested ?sheet=chara_DB, the response SHOULD be the content of that sheet.

            let content = [];
            if (Array.isArray(data)) {
                content = data;
            } else if (data && typeof data === 'object') {
                // Try to find the array inside
                const key = Object.keys(data).find(k => Array.isArray(data[k]));
                if (key) content = data[key];
                else if (data[result.sheet]) content = data[result.sheet]; // e.g. { chara_DB: [...] }
            }

            // Assign to correct variable
            if (result.sheet === 'chara_DB') charaDB = content;
            if (result.sheet === 'job_icon') jobIcon = content;
            if (result.sheet === 'icon_att') iconAtt = content;
        });

        // Ensure they are arrays
        state.data.charaDB = Array.isArray(charaDB) ? charaDB : [];
        state.data.jobIcon = Array.isArray(jobIcon) ? jobIcon : [];
        state.data.iconAtt = Array.isArray(iconAtt) ? iconAtt : [];

        console.log('Parsed Data:', {
            charaDB_len: state.data.charaDB.length,
            jobIcon_len: state.data.jobIcon.length,
            iconAtt_len: state.data.iconAtt.length
        });

        if (state.data.charaDB.length === 0) {
            console.warn('CharaDB is empty after multi-fetch. Check if sheet names match exactly.');
        }

        // Populate dynamic filters
        populateFilters();

        /* Debug Output Removed */

        // Initial Render

        // Initial Render
        applyFiltersAndRender();
        elements.loadingMsg.classList.add('hidden');

    } catch (err) {
        console.error(err);
        elements.loadingMsg.classList.add('hidden');
        elements.errorMsg.textContent = 'データの読み込みに失敗しました: ' + err.message + ' (F12キーでコンソールログを確認してください)';
        elements.errorMsg.classList.remove('hidden');
    }
}

// --- Data Processing & Helper ---
function getJobIcon(job, charClass) {
    if (!state.data.jobIcon.length) return null;

    // 1. Try match both job and class
    let found = state.data.jobIcon.find(item => item['職'] === job && item['クラス'] === charClass);
    if (found) return found.icon;

    // 2. Try match just job (fallback)
    found = state.data.jobIcon.find(item => item['職'] === job);
    return found ? found.icon : null;
}

function getElementIcon(element) {
    if (!state.data.iconAtt.length) return null;
    const found = state.data.iconAtt.find(item => item['エレメント'] === element);
    return found ? found.icon : null;
}

// GC status logic: check multiple potential keys and handle "無" value in spreadsheet
function getGCStatusValue(char) {
    const rawVal = char['GC後のパラメーター調整の有無_最終調整日'] || char['GC後のパラメーター調整の有無'] || '';
    const strVal = rawVal.toString().trim();
    // If empty, or explicitly "無", it is considered "No adjustment"
    if (!strVal || strVal === '無') return '無';
    return '有';
}

// --- Global Helper for Icon Resizing ---
window.resizeIcon = function (img) {
    if (img.naturalWidth) {
        // Spec: 180px -> 30px, 360px -> 60px (Scale 1/6)
        const newWidth = Math.round(img.naturalWidth / 6);
        img.style.width = newWidth + 'px';
        img.style.height = 'auto'; // Maintain aspect ratio
        img.style.visibility = 'visible'; // Show after resize
    }
};

// --- Rendering ---
function renderTable(data) {
    elements.tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        elements.noResultMsg.classList.remove('hidden');
        elements.resultCount.textContent = 0;
        return;
    }

    elements.noResultMsg.classList.add('hidden');
    elements.resultCount.textContent = data.length;

    const fragment = document.createDocumentFragment();

    data.forEach(char => {
        const tr = document.createElement('tr');

        // --- Mapping Logic ---
        // 1. Job Icon: Match char['職'] + char['クラス'] 
        const jobIconUrl = getJobIcon(char['職'], char['クラス']);
        // 2. Element Icon: Match char['エレメント']
        const elIconUrl = getElementIcon(char['エレメント']);

        // 3. Direct Column Mappings
        const rarity = char['レアリティ'] || '-';
        // Use 'キャラ名' as primary, fallback to old key if needed
        const charName = char['キャラ名'] || char['キャラクター名'] || '名称不明';
        const cv = char['声優'] || '-';
        const jobAttr = char['職属性'] || '-';
        const charClass = char['クラス'] || '-';
        const type = char['タイプ'] || '-';
        const category = char['カテゴリー'] || '-';
        const era = char['年代'] || '-';

        // Display Text
        const jobName = char['職'] || '-';
        const elName = char['エレメント'] || '-';

        // Spec: Added icon column and GC status column
        // Icon Column
        const charIconUrl = char['icon'] || '';

        // GC status logic: check multiple potential keys and handle "無" value in spreadsheet
        const gcStatusClass = getGCStatusValue(char);
        const rawGC = char['GC後のパラメーター調整の有無_最終調整日'] || char['GC後のパラメーター調整の有無'] || '';
        const gcDisplay = (gcStatusClass === '有') ? rawGC : '無';

        // Cells - Order: Icon, Rarity, Name, CV, JobAttr, Job(Icon), Class, Element(Icon), Type, GC, Category, Era
        tr.innerHTML = `
            <td class="col-icon-main">
                ${charIconUrl ? `<img src="${charIconUrl}" alt="${charName}" class="char-icon">` : ''}
            </td>
            <td>${rarity}</td>
            <td class="col-name" style="font-weight:bold; color:var(--primary-color);">${charName}</td>
            <td class="col-cv">${cv}</td>
            <td>${jobAttr}</td>
            <td class="col-icon">
                <div class="icon-content">
                    ${jobIconUrl ? `<img src="${jobIconUrl}" alt="${jobName}" class="row-icon" onload="resizeIcon(this)" style="visibility:hidden">` : ''}
                    <span class="icon-text">${jobName}</span>
                </div>
            </td>
            <td class="desktop-only">${charClass}</td>
            <td class="col-icon">
                <div class="icon-content">
                    ${elIconUrl ? `<img src="${elIconUrl}" alt="${elName}" class="row-icon" onload="resizeIcon(this)" style="visibility:hidden">` : ''}
                    <span class="icon-text">${elName}</span>
                </div>
            </td>
            <td class="desktop-only">${type}</td>
            <td class="col-gc">${gcDisplay}</td>
            <td>${category}</td>
            <td>${era}</td>
        `;
        fragment.appendChild(tr);
    });

    elements.tableBody.appendChild(fragment);
}

// --- Filtering ---
function populateFilters() {
    // 1. Job Filter: From job_icon sheet '職' column
    // Use charaDB as fallback if job_icon is empty
    const sourceForJobs = (state.data.jobIcon && state.data.jobIcon.length > 0)
        ? state.data.jobIcon
        : state.data.charaDB;

    const jobs = [...new Set(sourceForJobs.map(item => item['職']).filter(Boolean))].sort();

    // 2. Type Filter: From chara_DB sheet 'タイプ' column
    const types = [...new Set(state.data.charaDB.map(c => c['タイプ']).filter(Boolean))].sort();

    // 3. Element Filter: From icon_att sheet 'エレメント' column
    // Use charaDB as fallback if icon_att is empty
    const sourceForElements = (state.data.iconAtt && state.data.iconAtt.length > 0)
        ? state.data.iconAtt
        : state.data.charaDB;

    const elementsList = [...new Set(sourceForElements.map(item => item['エレメント']).filter(Boolean))].sort();


    // Fill Job Select
    const jobSelect = elements.filterInputs.job;
    // Keep first option "All"
    while (jobSelect.options.length > 1) jobSelect.remove(1);
    jobs.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j;
        opt.textContent = j;
        jobSelect.appendChild(opt);
    });

    // Fill Type Select
    const typeSelect = elements.filterInputs.type;
    while (typeSelect.options.length > 1) typeSelect.remove(1);
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeSelect.appendChild(opt);
    });

    // Fill Element Select
    const elSelect = elements.filterInputs.element;
    const fixedElementOrder = ['炎', '水', '雷', '光', '闇', '無', '無/炎', '無/水', '無/雷', '無/光', '無/闇'];

    // Keep first option "All"
    while (elSelect.options.length > 1) elSelect.remove(1);

    fixedElementOrder.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        elSelect.appendChild(opt);
    });

    // Fill Era Select (Dynamic: 2014 ~ Current Year)
    const eraSelect = elements.filterInputs.era;
    if (eraSelect) {
        while (eraSelect.options.length > 1) eraSelect.remove(1);
        const startYear = 2014;
        const currentYear = new Date().getFullYear();
        for (let y = startYear; y <= currentYear; y++) {
            const yearStr = y + '年';
            const opt = document.createElement('option');
            opt.value = yearStr;
            opt.textContent = yearStr;
            eraSelect.appendChild(opt);
        }
    }
}

function applyFiltersAndRender() {
    const rawData = state.data.charaDB;

    const filtered = rawData.filter(char => {
        // Character Name (Partial match)
        const nameToSearch = char['キャラ名'] || char['キャラクター名'] || '';
        if (state.filters.charName && !nameToSearch.includes(state.filters.charName)) return false;

        // CV (Partial match)
        if (state.filters.cv && !char['声優'].includes(state.filters.cv)) return false;

        // Rarity (Exact)
        if (state.filters.rarity && char['レアリティ'] !== state.filters.rarity) return false;

        // Job (Exact)
        if (state.filters.job && char['職'] !== state.filters.job) return false;

        // Element (Exact)
        if (state.filters.element && char['エレメント'] !== state.filters.element) return false;

        // Type (Exact)
        if (state.filters.type && char['タイプ'] !== state.filters.type) return false;

        // Class (Exact)
        if (state.filters.class && char['クラス'] !== state.filters.class) return false;

        // Category (Partial)
        const cat = char['カテゴリー'] || '';
        if (state.filters.category && !cat.includes(state.filters.category)) return false;

        // Era (Exact)
        const era = char['年代'] || '';
        if (state.filters.era && era !== state.filters.era) return false;

        // GC (Custom Logic)
        if (state.filters.gc) {
            const currentGC = getGCStatusValue(char);
            if (state.filters.gc !== currentGC) return false;
        }

        return true;
    });

    renderTable(filtered);
}

// --- Event Listeners ---
function setupEventListeners() {
    // Input fields -> 'input' event for real-time
    const inputs = ['charName', 'cv', 'category'];
    inputs.forEach(key => {
        if (!elements.filterInputs[key]) return;
        elements.filterInputs[key].addEventListener('input', (e) => {
            state.filters[key] = e.target.value;
            applyFiltersAndRender();
        });
    });

    // Select fields -> 'change' event
    const selects = ['rarity', 'job', 'element', 'type', 'class', 'era', 'gc'];
    selects.forEach(key => {
        if (!elements.filterInputs[key]) return;
        elements.filterInputs[key].addEventListener('change', (e) => {
            state.filters[key] = e.target.value;
            applyFiltersAndRender();
        });
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    fetchData();
});
