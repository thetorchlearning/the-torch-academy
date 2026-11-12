THE TORCH ACADEMY WEBSITE + TORCH INSIGHTS
==========================================

Existing pages: index.html, about.html, programmes.html, learners.html, approach.html, contact.html.
Blog: /blog/
CMS: /admin/ (requires GitHub OAuth setup in Netlify; see BLOG-SETUP-NOTES.txt).

All files in this package belong directly in the root of the existing GitHub repository.
Netlify build command: npm run build
Netlify publish directory: .

See BLOG-SETUP-NOTES.txt for the required authentication setup and deployment details.

EDITORIAL EDITING FEATURES
--------------------------
The article Markdown editor includes the standard image upload toolbar, so images can be inserted at the cursor position throughout an article. The custom "Image with caption" editor component adds a caption and placement choice (wide, centred, left, or right).

The editor also includes an "Editorial paragraph box" component with five visual designs, plus five inline sentence-highlight styles. These components are saved as HTML inside the Markdown article and styled by assets/blog.css. Their editor preview styles are loaded from assets/editorial-preview.css.

YouTube embed HTML can be pasted into the Markdown article body. Video embeds are styled responsively on the published article page.
