(function () {
    var KEY = 'vp_theme';
    function currentTheme() {
        try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; }
    }
    function applyTheme() {
        var t = currentTheme();
        document.documentElement.setAttribute('data-theme', t);
        var buttons = document.querySelectorAll('[data-theme-btn]');
        for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            var icon = b.querySelector('.theme-icon');
            if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
            var label = b.querySelector('.theme-label');
            if (label) label.textContent = t === 'dark' ? 'Light mode' : 'Night reading';
            b.title = t === 'dark' ? 'Switch to light mode' : 'Switch to night reading';
            b.setAttribute('aria-pressed', t === 'dark');
        }
    }
    window.currentTheme = currentTheme;
    window.applyTheme = applyTheme;
    window.toggleTheme = function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch (e) {}
        applyTheme();
    };
    try {
        if (localStorage.getItem(KEY) === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    } catch (e) {}
    document.addEventListener('DOMContentLoaded', applyTheme);
    window.addEventListener('pageshow', applyTheme);
    window.addEventListener('storage', function (e) {
        if (e.key === KEY) applyTheme();
    });
})();