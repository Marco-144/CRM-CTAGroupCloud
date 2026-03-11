async function apiFetch(url, options = {}) {

    const token = sessionStorage.getItem("authToken");
    const isFormData = options.body instanceof FormData;

    options.headers = {
        ...(options.headers || {})
    };

    if (!isFormData && !options.headers["Content-Type"]) {
        options.headers["Content-Type"] = "application/json";
    }

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