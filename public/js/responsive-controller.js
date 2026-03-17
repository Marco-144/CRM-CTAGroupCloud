(() => {

    const MOBILE_TOGGLE_SELECTOR = '.sidebar-mobile-toggle';

    function isMobileVertical() {
        return window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
    }

    function getLayoutElements() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        return { sidebar, overlay };
    }

    function closeMobileSidebar() {
        const { sidebar, overlay } = getLayoutElements();
        if (!sidebar || !overlay) return;

        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
    }

    function updateToggleVisibility() {
        const isMobile = isMobileVertical();
        const buttons = document.querySelectorAll(MOBILE_TOGGLE_SELECTOR);

        buttons.forEach((button) => {
            button.style.display = isMobile ? '' : 'none';
        });

        if (!isMobile) {
            closeMobileSidebar();
        }
    }

    function handleToggleClick(event) {
        const button = event.target.closest(MOBILE_TOGGLE_SELECTOR);
        if (!button) return;

        const { sidebar, overlay } = getLayoutElements();
        if (!sidebar || !overlay || !isMobileVertical()) return;

        sidebar.classList.remove('collapsed');
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
    }

    function handleOverlayClick(event) {
        if (event.target.id !== 'sidebarOverlay') return;
        closeMobileSidebar();
    }

    function handleOrientation() {
        setTimeout(() => {
            updateToggleVisibility();
            window.dispatchEvent(new Event('app:resize'));
        }, 200);
    }

    function init() {
        updateToggleVisibility();
    }

    window.addEventListener('resize', updateToggleVisibility);
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('app:resize', updateToggleVisibility);

    document.addEventListener('click', handleToggleClick);
    document.addEventListener('click', handleOverlayClick);
    document.addEventListener('DOMContentLoaded', init);

})();