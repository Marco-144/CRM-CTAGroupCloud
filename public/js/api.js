async function apiFetch(url, options = {}) {

    const token = sessionStorage.getItem("authToken");

    options.headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        options.headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
        sessionStorage.clear();
        window.location.href = "login.html";
        return;
    }

    return response;

}

window.apiFetch = apiFetch;