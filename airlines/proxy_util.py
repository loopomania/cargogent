import os
import random
import string
from urllib.parse import quote, unquote, urlparse, urlunparse

def get_proxy_extension(proxy_url, folder_path="/tmp/proxy_auth_extension"):
    """
    Creates a Chrome extension to handle proxy authentication for proxies that require username/password.
    Usage:
        proxy_url = "http://user:pass@host:port"
        ext_path = get_proxy_extension(proxy_url)
        options.add_argument(f"--load-extension={ext_path}")
    """
    parsed = urlparse(proxy_url or "")
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not parsed.port:
        return None

    user = parsed.username
    password = parsed.password
    host = parsed.hostname
    port = parsed.port

    if not user:
        return None  # No auth needed, standard --proxy-server=host:port works
    user = unquote(user)
    password = unquote(password or "")

    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
    
    manifest_json = """
    {
        "version": "1.0.0",
        "manifest_version": 2,
        "name": "Chrome Proxy",
        "permissions": [
            "proxy",
            "tabs",
            "unlimitedStorage",
            "storage",
            "activeTab",
            "<all_urls>",
            "webRequest",
            "webRequestBlocking"
        ],
        "background": {
            "scripts": ["background.js"]
        },
        "minimum_chrome_version":"22.0.0"
    }
    """
    
    background_js = """
    var config = {
            mode: "fixed_servers",
            rules: {
              singleProxy: {
                scheme: "http",
                host: "%s",
                port: parseInt(%s)
              },
              bypassList: ["localhost"]
            }
          };

    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});

    function callbackFn(details) {
        return {
            authCredentials: {
                username: "%s",
                password: "%s"
            }
        };
    }

    chrome.webRequest.onAuthRequired.addListener(
                callbackFn,
                {urls: ["<all_urls>"]},
                ['blocking']
    );
    """ % (host, port, user, password)
    
    with open(os.path.join(folder_path, "manifest.json"), "w") as f:
        f.write(manifest_json)
    
    with open(os.path.join(folder_path, "background.js"), "w") as f:
        f.write(background_js)
    
    return folder_path

def get_rotating_proxy(base_proxy_url: str, session_id: str = None) -> str:
    """
    Transform a base proxy URL into a session-rotated one if it's a known service like IPRoyal.
    Otherwise, returns the base proxy URL to support any premium generic proxy service (BrightData, ZenRows, etc).
    Example Input: http://user:pass@geo.iproyal.com:12321
    Example Output: http://user-country-us-session-abc12345:pass@geo.iproyal.com:12321
    """
    if not base_proxy_url:
        return base_proxy_url

    parsed = urlparse(base_proxy_url)
    if not parsed.hostname or "iproyal" not in parsed.hostname.lower():
        # Non-IPRoyal providers may already support native/session params.
        return base_proxy_url

    # IPRoyal rotation is controlled by username suffix.
    username = parsed.username
    password = parsed.password
    if not username or password is None:
        return base_proxy_url

    decoded_user = unquote(username)
    if "session-" in decoded_user:
        # Respect explicit session already configured by user.
        return base_proxy_url

    # Use sticky session_id if provided, otherwise generate random
    session = session_id or "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    
    # IPRoyal Residential typically requires at least -session- or -country-
    # Adding -country-any often helps pull from a broader, higher-quality residential pool.
    if "country-" not in decoded_user:
        rotated_user = f"{decoded_user}-country-any-session-{session}"
    else:
        rotated_user = f"{decoded_user}-session-{session}"

    auth = f"{quote(rotated_user, safe='-')}:{quote(unquote(password), safe='')}"
    host = parsed.hostname
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{auth}@{host}{port}"

    return urlunparse(
        (
            parsed.scheme or "http",
            netloc,
            parsed.path or "",
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )
            
    # For BrightData, Oxylabs, ScraperAPI, ZenRows proxies, they usually auto-rotate or use built-in session formatting.
    return base_proxy_url

