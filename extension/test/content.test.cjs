const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');
class Element {
  constructor(classes = '', innerText = '', children = [], attributes = {}) {
    this.attributes = attributes; this.classes = classes.split(' '); this.innerText = innerText; this.children = children;
    this.classList = { contains: name => this.classes.includes(name) };
    children.forEach(child => child.parentElement = this);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getClientRects() { return [1]; }
  contains(other) { return this.children.some(child => child === other || child.contains(other)); }
  querySelectorAll(selector) {
    const matches = el => selector.split(',').some(part => {
      const simple = part.trim();
      const attr = simple.match(/^\[([\w-]+)="([^"]+)"\]$/);
      return attr ? el.getAttribute(attr[1]) === attr[2] : /^\.[\w-]+$/.test(simple) && el.classes.includes(simple.slice(1));
    });
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function conversation(wrapper = 'new-linkedin-wrapper') {
  const group = new Element('msg-s-message-group', '', [new Element('msg-s-message-group__name', 'Alex'), new Element('msg-s-event-listitem__body', 'Hello!')]);
  return new Element(wrapper, '', [new Element('msg-thread__link-to-profile', 'Alex'), new Element('msg-s-message-list', '', [new Element('msg-s-message-list-content', '', [group])])]);
}
function read(children) {
  const body = new Element('', '', children);
  return runInNewContext(source, { document: { body, querySelectorAll: selector => body.querySelectorAll(selector) }, getComputedStyle: () => ({ visibility: 'visible' }) });
}
test('full-page message lists work without legacy wrappers', () => {
  const result = read([conversation()]);
  assert.equal(result.contact, 'Alex'); assert.equal(result.latestMessage, 'Hello!'); assert.equal(result.messages.length, 1);
});
test('nested legacy wrappers count as one conversation', () => {
  assert.equal(read([new Element('msg-thread', '', [conversation('msg-convo-wrapper')])]).latestMessage, 'Hello!');
});
test('multiple conversations and empty screens fail safely', () => {
  assert.match(read([conversation(), conversation()]).error, /Multiple conversations/);
  assert.match(read([]).error, /open conversation/);
});

test('current message-list-item markup uses avatar identity and reads all bodies once', () => {
  const item = (name, texts) => new Element('', '', [
    ...(name ? [new Element('msg-s-event-listitem__profile-picture', '', [], { title: name, alt: name })] : []),
    new Element('msg-s-message-group__meta'),
    ...texts.map(value => new Element('msg-s-event-listitem__body', value))
  ], { 'data-view-name': 'message-list-item' });
  const thread = new Element('', '', [new Element('msg-thread__link-to-profile', 'Alex'), new Element('', '', [
    item('Alex', ['First', 'Second']), item('', ['Continuation']), item('Me', ['My reply'])
  ])]);
  const result = read([thread]);
  assert.equal(result.contact, 'Alex');
  assert.equal(result.messages.length, 4);
  assert.equal(result.latestMessage, 'Continuation');
  assert.equal(result.messages[3].role, 'unknown');
});
test('nested event containers do not duplicate current message items', () => {
  const item = new Element('', '', [new Element('msg-s-event-listitem__profile-picture', '', [], { alt: 'Alex' }), new Element('msg-s-event-listitem__body', 'Hello!')], { 'data-view-name': 'message-list-item' });
  const thread = new Element('', '', [new Element('msg-thread__link-to-profile', 'Alex'), new Element('msg-s-message-list', '', [new Element('msg-s-message-list__event', '', [item])])]);
  assert.equal(read([thread]).messages.length, 1);
});

test('failed reads expose version and structural counts without conversation text', () => {
  const result = read([new Element('', '', [new Element('msg-s-event-listitem__body', 'private message')], { 'data-view-name': 'message-list-item' })]);
  assert.match(result.error, /RP-read-v4: items 1, bodies 1, headings 0, visible bodies 1/);
  assert.doesNotMatch(result.error, /private message/);
});

test('avatar names match headings with badges, presence text and whitespace', () => {
  const item = new Element('', '', [
    new Element('msg-s-message-group__name', 'Alex Verified'),
    new Element('msg-s-event-listitem__profile-picture', '', [], { title: 'Alex Kwon' }),
    new Element('msg-s-event-listitem__body', 'Latest contact message')
  ], { 'data-view-name': 'message-list-item' });
  const thread = new Element('', '', [new Element('msg-thread__link-to-profile', 'Alex\n Kwon\n Mobile • 1 day ago'), new Element('msg-s-message-list', '', [item])]);
  const result = read([thread]);
  assert.equal(result.contact, 'Alex Kwon');
  assert.equal(result.latestMessage, 'Latest contact message');
});
test('multiple participant identities in heading fail safely', () => {
  const item = name => new Element('msg-s-message-group', '', [new Element('msg-s-message-group__name', name), new Element('msg-s-event-listitem__body', 'Hello')]);
  const thread = new Element('', '', [new Element('msg-thread__link-to-profile', 'Alex and Sam'), new Element('msg-s-message-list', '', [item('Alex'), item('Sam')])]);
  assert.match(read([thread]).error, /Multiple senders/);
});
