
import os
import zipfile

def get_proxy_extension(proxy_url, folder_path="/tmp/proxy_auth_extension"):
    """
    Creates a Chrome extension to handle proxy authentication for proxies that require username/password.
    Usage:
        proxy_url = "http://user:pass@host:port"
        ext_path = get_proxy_extension(proxy_url)
        options.add_argument(f"--load-extension={ext_path}")
    """
    import re
    # Match: http://user:pass@host:port or http://host:port
    match = re.search(r'http://(?:(.*):(.*)@)?(.*):(\d+)', proxy_url)
    if not match:
        return None
    
    user, password, host, port = match.groups()
    if not user:
        return None  # No auth needed, standard --proxy-server=host:port works

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

def get_iproyal_proxy(base_proxy_url: str) -> str:
    """
    Transform a base IPRoyal proxy URL into a US-targeted, session-rotated one.
    Example Input: http://user:pass@geo.iproyal.com:12321
    Example Output: http://user-country-us-session-abc12345:pass@geo.iproyal.com:12321
    """
    import re
    import random
    import string

    if not base_proxy_url or "iproyal" not in base_proxy_url.lower():
        return base_proxy_url

    # Match http://user:pass@host:port
    match = re.search(r'(https?://)([^:@]+):([^@]*)@(.+)', base_proxy_url)
    if not match:
        return base_proxy_url

    protocol, user, password, rest = match.groups()
    
    # Generate random 8-char session
    session_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    
    # Ensure US targeting and session rotation
    # If user already contains session or country, we might need to be careful, 
    # but for standard geo.iproyal.com we usually append.
    new_user = f"{user}-country-us-session-{session_id}"
    
    return f"{protocol}{new_user}:{password}@{rest}"
