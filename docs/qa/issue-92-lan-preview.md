# Issue #92 — trusted-LAN QA preview

This is an opt-in HTTP preview of a freshly built, release-safe static site on a MacBook. It is for QA on a trusted local network only. It does not deploy the site, publish the private catalog, authorize launch, or change the NO-GO state of [Stage 20D #69](issue-69-accessibility-performance.md) or [Stage 20F #71](issue-71-release-decision.md).

## Start the MacBook preview

From a clean checkout of `main` on the MacBook:

```sh
git checkout main
git pull --ff-only
nvm use
npm ci
npm run qa:lan:preview
```

The command requires Node 24 and the locked `npm ci` install. It removes any previous `dist`, runs the source check, makes a new normal `npm run build`, and runs the existing Pages, public-content, product-registry, editorial, Romanian, legal, asset-rights and release-decision checks before opening a port. Any missing or failing gate stops startup. It never runs `build:beta`. The output includes Git HEAD, whether the source tree was dirty at startup, the canonical public `dist` manifest SHA-256, the preview PID, and the English and Romanian URLs when one LAN IPv4 address can be identified.

`0.0.0.0` is the default **bind address**; it is not an address to enter on a phone or tablet. The command prints device URLs in this form when detection is unambiguous:

```text
http://<Mac-LAN-IP>:4321/en/
http://<Mac-LAN-IP>:4321/ro/
```

These are examples, not the MacBook's actual address. Open the exact URLs printed by the command. Use `--port 4322` to choose another port. If the Mac has multiple active adapters, the command does not guess or print the adapter inventory. On macOS, run `networksetup -listallhardwareports`, identify the Wi-Fi `Device`, then run `ipconfig getifaddr <device>`. Restart with `npm run qa:lan:preview -- --host <that-IPv4>` to bind and advertise that address. The selected address must belong to the Mac.

Keep the MacBook, Android phone and iPad on the same trusted Wi-Fi. Approve the macOS firewall's incoming-connection prompt for Node if shown. If another device cannot connect, check that VPNs are disconnected, the Wi-Fi does not enable client/AP isolation, the selected Mac address is on that Wi-Fi, and the chosen port is available. The command does not change firewall rules, configure a proxy, or open a tunnel. Stop it with **Ctrl-C** in the terminal; SIGINT and SIGTERM are forwarded to the preview process.

From a second Mac terminal, smoke-check both routes (replace the example address with the printed one):

```sh
MAC_LAN_IP=192.168.1.24 # example only; replace with the address printed by the command
curl --fail --show-error --location "http://${MAC_LAN_IP}:4321/en/" -o /dev/null
curl --fail --show-error --location "http://${MAC_LAN_IP}:4321/ro/" -o /dev/null
```

Then open each printed URL from Android Chrome and iPad Safari. If the Mac's own curl works but device curl does not, investigate Wi-Fi isolation, VPN and firewall settings before treating this as a website failure.

## Manual device and browser checklist

Run each applicable item in **both EN and RO**. Visit all six informational route types: home, products, accessories, support, about and contact. Record actual browser and OS versions, device model, test date and tester; leave any unperformed result `NOT_RUN`. Use the [versioned #69 matrix](issue-69-matrix.json) for the ten required evidence rows; do not duplicate or overwrite its rows with iPad results.

- **Android phone:** Chrome stable + TalkBack; portrait and landscape; navigation closed and expanded.
- **iPad (supplemental):** Safari + VoiceOver on iPadOS 18.7.8. Confirm and record the exact iPad model and Safari build at test time; they are not asserted here. Test portrait and landscape, with navigation closed and expanded.
- **Mac:** Safari, Firefox stable and Chromium stable in real desktop sessions.
- **Across the relevant sessions:** keyboard focus order and visibility, skip link, navigation, Escape and focus return, touch, image alternatives, semantic control names/roles/states, 200% and 400% zoom/reflow, reduced motion, contrast, and EN/RO language switching.

Attach concise, sanitized observations and defect references to the existing [#69 QA issue](https://github.com/YuriiSokolenko/bodich/issues/69), or open a focused defect linked from it. Keep private recordings, personal identifiers, private gallery links and unpublished supplier material in authorized restricted storage; do not commit them. Do not claim a test, independent retest or sign-off until a person has completed and recorded it.

**The iPad is supplemental evidence only.** It does not satisfy the required iPhone Safari + VoiceOver EN/RO rows in #69. Those iPhone rows remain `NOT_RUN` until tested on an actual iPhone; this guide does not change any matrix state.

## Keep evidence types separate

- This HTTP LAN session is manual real-device/browser QA. It does not certify HTTPS, Cloudflare Pages headers, production behavior, field Core Web Vitals or iPhone Safari.
- The existing axe and Lighthouse workflow is automated lab evidence, not a substitute for TalkBack, VoiceOver, real Safari sessions or human sign-off.
- Field INP remains `NO_FIELD_DATA` unless a real eligible field sample is collected. Lab TBT is not INP.
- Any later hosted preview requires a separately authorized protected HTTPS/Cloudflare Access plan. Do not provision public Pages, change DNS, or treat this LAN command as deployment.

Keep #69 and #71 **NO-GO** until required device tests, independent retests and sign-offs are complete and tied to the same release-candidate SHA and `dist` digest.
