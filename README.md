# Embed guide for GoDaddy Custom Code

The `index.html` file in this repo is designed to be hosted as a static page, then embedded
in GoDaddy via a short `<iframe>` to avoid Custom Code length limits.

## 1) Enable GitHub Pages

1. In the GitHub repo, go to **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose the `main` branch and `/ (root)` folder, then save.

Once Pages is enabled, your site will be available at:

```
https://awlondon.github.io/YOWR-3HT8H3-UW/
```

## 2) Add this snippet to GoDaddy Custom Code

```html
<iframe
  src="https://awlondon.github.io/YOWR-3HT8H3-UW/"
  style="width:100%;height:800px;border:0;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade">
</iframe>
```

Adjust the `height` value to fit your layout.
