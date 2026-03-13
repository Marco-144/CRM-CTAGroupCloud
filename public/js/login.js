// Configuración editable (después podrá venir desde API o BD)
const appConfig = {
    logo: "assets/CTA-02.png",

    colors: {
        primary: "#1c2140",
        primaryHover: "#14182f",
        secondary: "#6c757d",
        backgroundStart: "#58bfca",
        backgroundEnd: "#33a4dd"
    }
};

document.getElementById("companyLogo").src = appConfig.logo;

document.documentElement.style.setProperty('--primary-color', appConfig.colors.primary);
document.documentElement.style.setProperty('--secondary-color', appConfig.colors.primaryHover);
document.documentElement.style.setProperty('--background-start', appConfig.colors.backgroundStart);
document.documentElement.style.setProperty('--background-end', appConfig.colors.backgroundEnd);

const loginForm = document.getElementById("loginForm");
const userInput = document.getElementById("user");
const passwordInput = document.getElementById("password");
const loginCard = document.querySelector(".login-card");
const API_BASE = window.API_BASE || "";

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const user = userInput.value.trim();
    const password = passwordInput.value;

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user, password })
        });

        if (!response.ok) {
            throw new Error("Credenciales inválidas");
        }

        const result = await response.json();

        if (!result?.success || !result?.token) {
            throw new Error("No se pudo iniciar sesión");
        }

        sessionStorage.setItem("authToken", result.token);
        sessionStorage.setItem("loggedUser", result.user?.name || result.user?.username || user);
        sessionStorage.setItem("loggedUserData", JSON.stringify(result.user || {}));

        window.location.href = "main-menu.html";
    } catch (error) {
        userInput.value = "";
        passwordInput.value = "";
        userInput.focus();

        loginCard.classList.remove("login-error");
        void loginCard.offsetWidth;
        loginCard.classList.add("login-error");
    }
});

/* fetch('/api/settings')
  .then(res => res.json())
  .then(config => {
      console.log('Config loaded:', config);

      const logoElement = document.getElementById("companyLogo");

      if (config.logo) {
          logoElement.src = "/" + config.logo.replace(/^\/+/, "");
      }

      document.documentElement.style.setProperty('--primary-color', config.primary_color);
      document.documentElement.style.setProperty('--primary-hover', config.primary_hover);
      document.documentElement.style.setProperty('--background-start', config.background_start);
      document.documentElement.style.setProperty('--background-end', config.background_end);
  }); */

