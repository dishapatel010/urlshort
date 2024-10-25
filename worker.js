export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // if (pathname === "/api/urls") {
    //   // Get all URLs
    //   const { results } = await env.UC.prepare("SELECT * FROM urls").all();
    //   return new Response(JSON.stringify(results), {
    //     headers: { 'Content-Type': 'application/json' },
    //   });
    // }

    if (pathname === "/api/shorten" && request.method === "POST") {
      const { originalUrl } = await request.json();

      // Check if the original URL already exists
      const existingUrl = await env.UC.prepare(
        "SELECT short_code FROM urls WHERE original_url = ?"
      ).bind(originalUrl).first();

      if (existingUrl) {
        // If it exists, return the existing shortened URL
        return new Response(JSON.stringify({ shortUrl: `${request.url.replace("/api/shorten", "/v")}/${existingUrl.short_code}` }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200 // Changed to 200 for existing URL
        });
      }

      const shortCode = Math.random().toString(36).substring(2, 8); // Generate random 6-character code

      // Insert new URL mapping with access count initialized to 0
      await env.UC.prepare(
        "INSERT INTO urls (short_code, original_url, access_count) VALUES (?, ?, ?)"
      ).bind(shortCode, originalUrl, 0).run();

      // Return the new shortened URL
      return new Response(JSON.stringify({ shortUrl: `${request.url.replace("/api/shorten", "/v")}/${shortCode}` }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201
      });
    }

    // Handle redirects for short URLs in the format /v/{shortCode}
    const shortCodeMatch = pathname.match(/^\/v\/([a-zA-Z0-9]+)$/);
    if (shortCodeMatch) {
      const shortCode = shortCodeMatch[1];

      // If this is a POST request, validate Turnstile token and redirect if successful
      if (request.method === "POST") {
        const formData = await request.formData();
        const token = formData.get('cf-turnstile-response');

        // Verify the Turnstile token
        const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: env.TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: request.headers.get("CF-Connecting-IP"),
          }).toString(),
        });

        const verifyResult = await verifyResponse.json();

        if (verifyResult.success) {
          // Token is valid, look up the original URL for this short code
          const result = await env.UC.prepare(
            "SELECT original_url FROM urls WHERE short_code = ?"
          ).bind(shortCode).first();

          if (result) {
            // Increment access count
            await env.UC.prepare(
              "UPDATE urls SET access_count = access_count + 1 WHERE short_code = ?"
            ).bind(shortCode).run();

            // Redirect to the original URL
            return Response.redirect(result.original_url, 302);
          } else {
            return new Response("Short URL not found", { status: 404 });
          }
        } else {
          // Return detailed failure reason
          return new Response(`Verification failed: ${JSON.stringify(verifyResult)}`, { status: 403 });
        }
      }

      // If this is a GET request, render the Turnstile form
      return new Response(await renderVerificationHTML(shortCode, env), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Return the HTML page if root path is requested
    if (pathname === "/") {
      return new Response(await renderHTML(), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

// HTML template function
async function renderHTML() {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Shortener</title>
    <style>
      body { 
        font-family: 'Arial', sans-serif; 
        margin: 0; 
        padding: 0; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        min-height: 100vh; 
        background-color: #f4f4f4; 
      }
      .container {
        background: #fff; 
        padding: 2rem; 
        border-radius: 8px; 
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); 
        max-width: 500px; 
        width: 100%; 
      }
      h1 { 
        margin-bottom: 1rem; 
        color: #333; 
      }
      label { 
        margin-bottom: 0.5rem; 
        color: #555; 
      }
      input[type="url"] { 
        width: 100%; 
        padding: 0.5rem; 
        margin-bottom: 1rem; 
        border: 1px solid #ccc; 
        border-radius: 4px; 
        font-size: 1rem; 
      }
      button { 
        padding: 0.7rem; 
        background-color: #007BFF; 
        color: white; 
        border: none; 
        border-radius: 4px; 
        cursor: pointer; 
        font-size: 1rem; 
      }
      button:hover { 
        background-color: #0056b3; 
      }
      #result { 
        display: none; 
        margin-top: 1rem; 
        color: #28a745; 
      }
      #short-url { 
        font-weight: bold; 
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Create a Short URL</h1>
      <form id="shorten-form">
        <label for="original-url">Enter the URL to shorten:</label>
        <input type="url" id="original-url" name="original-url" required placeholder="https://example.com">
        <button type="submit">Shorten URL</button>
      </form>
      <div id="result">
        <p>Shortened URL: <a id="short-url" href="#" target="_blank"></a></p>
      </div>
    </div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <script>
      document.getElementById("shorten-form").addEventListener("submit", async function(event) {
        event.preventDefault();
        const originalUrl = document.getElementById("original-url").value;
        document.getElementById("result").style.display = "none"; // Hide result initially

        const response = await fetch("/api/shorten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalUrl }),
        });

        if (response.ok) {
          const data = await response.json();
          const shortUrl = data.shortUrl;
          document.getElementById("short-url").textContent = shortUrl;
          document.getElementById("short-url").href = shortUrl;
          document.getElementById("result").style.display = "block"; // Show result
        } else {
          alert("Failed to create short URL. Please try again.");
        }
      });
    </script>
  </body>
  </html>`;
}

// HTML template for verification page
async function renderVerificationHTML(shortCode, env) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Verification</title>
    <style>
      body { 
        font-family: 'Arial', sans-serif; 
        margin: 0; 
        padding: 0; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        min-height: 100vh; 
        background-color: #f4f4f4; 
      }
      .container {
        background: #fff; 
        padding: 2rem; 
        border-radius: 8px; 
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); 
        max-width: 400px; 
        width: 100%; 
      }
      h2 { 
        margin-bottom: 1rem; 
        color: #333; 
      }
      button { 
        padding: 0.7rem; 
        background-color: #007BFF; 
        color: white; 
        border: none; 
        border-radius: 4px; 
        cursor: pointer; 
        font-size: 1rem; 
      }
      button:hover { 
        background-color: #0056b3; 
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Verify You're Human</h2>
      <form id="verification-form">
        <div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITE_KEY}"></div>
        <button type="submit">Continue to Original URL</button>
      </form>
    </div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <script>
      document.getElementById("verification-form").addEventListener("submit", async function(event) {
        event.preventDefault();
        const formData = new FormData(this);
        const response = await fetch("/v/${shortCode}", {
          method: "POST",
          body: formData,
        });
        
        if (response.redirected) {
          window.location.href = response.url;
        } else {
          alert("Verification failed, please try again.");
        }
      });
    </script>
  </body>
  </html>`;
}
