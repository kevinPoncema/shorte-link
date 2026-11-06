#!/usr/bin/env python3
"""
=========================================================================
KinetiQR - Simulador de Tráfico y Telemetría en Python
=========================================================================

Script en Python puro (usa únicamente la librería estándar `urllib`)
para simular visitas y escaneos de códigos QR a cualquier enlace corto
apuntando a localhost:3000.

Uso:
    python3 scripts/simulate_traffic.py [URL_O_SHORTCODE] [CANTIDAD_VISITAS]

Ejemplos:
    python3 scripts/simulate_traffic.py http://localhost:3000/62dwdaa 30
    python3 scripts/simulate_traffic.py 62dwdaa 20
=========================================================================
"""

import sys
import time
import random
import urllib.request
import urllib.parse
import urllib.error

TARGET_ARG = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000/62dwdaa'
TOTAL_VISITS = int(sys.argv[2]) if len(sys.argv) > 2 else 25

def normalize_target_url(arg: str) -> str:
    cleaned = arg.strip()
    if cleaned.startswith(('http://', 'https://')):
        parsed = urllib.parse.urlparse(cleaned)
        short_code = parsed.path.strip('/')
        if short_code.startswith('r/'):
            short_code = short_code[2:]
        return f"http://localhost:3000/{short_code}"
    cleaned = cleaned.removeprefix('kineti.qr/r/').strip('/')
    return f"http://localhost:3000/{cleaned}"

target_url = normalize_target_url(TARGET_ARG)

LOCATIONS = [
    {"city": "Tegucigalpa", "country": "HN", "flag": "🇭🇳", "ip": "190.92.40.12"},
    {"city": "San Pedro Sula", "country": "HN", "flag": "🇭🇳", "ip": "181.115.10.88"},
    {"city": "Roatán", "country": "HN", "flag": "🇭🇳", "ip": "190.53.18.4"},
    {"city": "Miami, FL", "country": "US", "flag": "🇺🇸", "ip": "104.16.132.229"},
    {"city": "New York, NY", "country": "US", "flag": "🇺🇸", "ip": "64.233.160.1"},
    {"city": "Los Angeles, CA", "country": "US", "flag": "🇺🇸", "ip": "172.217.1.14"},
    {"city": "Ciudad de México", "country": "MX", "flag": "🇲🇽", "ip": "189.206.12.50"},
    {"city": "Guadalajara", "country": "MX", "flag": "🇲🇽", "ip": "201.161.45.10"},
    {"city": "Madrid", "country": "ES", "flag": "🇪🇸", "ip": "83.45.12.34"},
    {"city": "Barcelona", "country": "ES", "flag": "🇪🇸", "ip": "213.97.23.101"},
    {"city": "Bogotá", "country": "CO", "flag": "🇨🇴", "ip": "186.84.90.15"},
    {"city": "Medellín", "country": "CO", "flag": "🇨🇴", "ip": "190.157.10.22"},
    {"city": "Ciudad de Guatemala", "country": "GT", "flag": "🇬🇹", "ip": "190.56.240.11"},
    {"city": "San José", "country": "CR", "flag": "🇨🇷", "ip": "196.40.22.8"},
]

CLIENT_PROFILES = [
    {
        "name": "iPhone 15 Pro (Safari Móvil)",
        "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    },
    {
        "name": "iPhone 14 (Safari Móvil)",
        "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    },
    {
        "name": "Samsung Galaxy S24 (Chrome Móvil)",
        "ua": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36"
    },
    {
        "name": "Google Pixel 8 (Chrome Móvil)",
        "ua": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36"
    },
    {
        "name": "MacBook Pro (Safari Desktop)",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
    },
    {
        "name": "Windows 11 (Chrome Desktop)",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    },
    {
        "name": "Windows 11 (Edge)",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
    },
    {
        "name": "Ubuntu Linux (Firefox)",
        "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0"
    },
]

CHANNELS = [
    {"label": "Stand Acrílico NFC Mesa", "referer": "https://kineti.qr/nfc-stand-acrylic"},
    {"label": "Placa NFC Mostrador", "referer": "https://kineti.qr/nfc-counter-stand"},
    {"label": "Tarjeta PVC Inteligente", "referer": "https://kineti.qr/nfc-table-card"},
    {"label": "Cámara Móvil (Escaneo Directo QR)", "referer": ""},
    {"label": "Instagram Stories", "referer": "https://l.instagram.com/"},
    {"label": "WhatsApp Chat", "referer": "https://api.whatsapp.com/"},
    {"label": "Google Search", "referer": "https://www.google.com/"},
]

def randomize_ip(base_ip: str) -> str:
    parts = base_ip.split('.')
    if len(parts) == 4:
        last = random.randint(2, 250)
        return f"{parts[0]}.{parts[1]}.{parts[2]}.{last}"
    return base_ip

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Detener la redirección automática para capturar el HTTP 302 original
        return None

opener = urllib.request.build_opener(NoRedirectHandler)

def send_visit(idx: int, total: int):
    loc = random.choice(LOCATIONS)
    client = random.choice(CLIENT_PROFILES)
    channel = random.choice(CHANNELS)
    simulated_ip = randomize_ip(loc["ip"])

    req = urllib.request.Request(target_url, method="GET")
    req.add_header("User-Agent", client["ua"])
    req.add_header("CF-IPCountry", loc["country"])
    req.add_header("X-Country-Code", loc["country"])
    req.add_header("X-Geo-Country", loc["country"])
    req.add_header("CF-Connecting-IP", simulated_ip)
    req.add_header("X-Real-IP", simulated_ip)
    req.add_header("X-Forwarded-For", f"{simulated_ip}, 172.18.0.1")

    if channel["referer"]:
        req.add_header("Referer", channel["referer"])

    start = time.time()
    try:
        response = opener.open(req, timeout=10)
        status = response.getcode()
        dest = response.headers.get("Location", "OK")
    except urllib.error.HTTPError as e:
        status = e.code
        dest = e.headers.get("Location", "Redirección interceptada")
    except Exception as e:
        print(f"[\033[31mERROR {idx}/{total}\033[0m] {e}")
        return False, None

    latency = int((time.time() - start) * 1000)

    print(
        f"[\033[36m{idx:02d}/{total}\033[0m] "
        f"{loc['flag']} \033[32m{loc['city']}, {loc['country']}\033[0m "
        f"| \033[33m{client['name']}\033[0m "
        f"| \033[35m{channel['label']}\033[0m "
        f"| IP: {simulated_ip} "
        f"| HTTP \033[1m{status}\033[0m ({latency}ms) "
        f"-> \033[90m{dest[:35]}...\033[0m"
    )

    return True, loc["country"]

def main():
    print("\n\033[1m\033[34m===============================================================\033[0m")
    print("🚀 KinetiQR - Simulador de Tráfico y Telemetría Real (Python)")
    print(f"🎯 URL Destino: \033[32m{target_url}\033[0m")
    print(f"📊 Peticiones a ejecutar: \033[33m{TOTAL_VISITS}\033[0m")
    print("\033[1m\033[34m===============================================================\033[0m\n")

    successful = 0
    countries_count = {}

    for i in range(1, TOTAL_VISITS + 1):
        ok, country = send_visit(i, TOTAL_VISITS)
        if ok:
            successful += 1
            if country:
                countries_count[country] = countries_count.get(country, 0) + 1
        time.sleep(random.uniform(0.08, 0.25))

    print("\n\033[1m\033[32m===============================================================\033[0m")
    print("✅ Simulación completada con éxito:")
    print(f"   - Peticiones exitosas: \033[1m{successful}/{TOTAL_VISITS}\033[0m")
    print(f"   - Países simulados: {countries_count}")
    print("\n\033[33mℹ️  Nota técnica sobre el Analytics Worker:\033[0m")
    print("   El worker en segundo plano del backend procesa la cola Redis")
    print("   cada 15 segundos y consolida las métricas en PostgreSQL.")
    print("   En breves segundos podrás ver las gráficas y desgloses actualizados")
    print("   en la pestaña de 'Analíticas' del frontend: \033[36mhttp://localhost:5173\033[0m")
    print("\033[1m\033[32m===============================================================\033[0m\n")

if __name__ == '__main__':
    main()
