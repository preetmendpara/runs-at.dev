// Blog content access: the generated module is the source of truth, so these
// tests read the real committed data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPost, publishedPosts, postSerial } from '../lib/blog.js';

// runs-at.dev starts with no posts, so these checks hold for any number of them.
test('publishedPosts lists published posts only, newest first', () => {
  const posts = publishedPosts();
  for (const p of posts) {
    assert.equal(p.status, 'published');
    assert.ok(p.title.length > 0);
    assert.ok(p.html.includes('<'), 'posts ship pre-rendered html');
  }
  for (let i = 1; i < posts.length; i++) {
    assert.ok(posts[i - 1].date >= posts[i].date, 'sorted newest first');
  }
});

test('unknown, invalid, and draft slugs resolve to null', () => {
  assert.equal(getPost('no-such-post'), null);
  // Traversal attempts: the slug grammar admits no separators, so getPost
  // cannot be walked out of the generated content.
  for (const slug of ['../secret', 'a/b', '..', 'UPPER', '']) {
    assert.equal(getPost(slug), null, slug);
  }
});

test('serial numbers count newest-first from 1', () => {
  const posts = publishedPosts();
  if (posts.length > 0) {
    assert.equal(postSerial(posts[0].slug), 1, 'newest post is №1');
    assert.equal(postSerial(posts[posts.length - 1].slug), posts.length, 'oldest post has the highest serial');
  }
  assert.equal(postSerial('no-such-post'), null);
});

// The .md twin (served at /blog/<slug>.md and copied by the post toolbar)
// must round-trip: gray-matter parses it back into the same fields.
test('markdownTwin rebuilds a parseable markdown file', async () => {
  const { default: matter } = await import('gray-matter');
  const { markdownTwin } = await import('../lib/blog.js');
  const post = {
    title: 'Hello "world"', date: '2026-09-22', author: 'preetmendpara', category: 'news',
    markdown: '## Hello\n\nFirst post.',
  };
  const twin = markdownTwin(post);
  const { data, content } = matter(twin);
  assert.equal(data.title, post.title);
  assert.equal(data.date, post.date);
  assert.equal(data.category, post.category);
  assert.ok(content.includes('First post.'), 'body content rides along');
  for (const post of publishedPosts()) {
    assert.ok(post.markdown.length > 0, `${post.slug} carries markdown`);
  }
});

// Heading ids: the "On this page" menu scrolls to these, so every h2/h3 in
// the baked html must carry an id, and the collected list must match.
test('posts carry heading ids and a matching on-this-page list', async () => {
  const { markdownTwin } = await import('../lib/blog.js');
  for (const post of publishedPosts()) {
    assert.ok(Array.isArray(post.headings), `${post.slug} exposes headings`);
    for (const h of post.headings) {
      assert.ok(post.html.includes(`id="${h.id}"`), `${post.slug} html has id ${h.id}`);
      assert.ok(h.text.length > 0, `${post.slug} heading ${h.id} carries visible text`);
    }
    assert.ok(markdownTwin(post).length > post.markdown.length, 'twin wraps the markdown');
  }
});
