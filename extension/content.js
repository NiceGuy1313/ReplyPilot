(() => {
  const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const text = el => el?.innerText?.trim() || '';
  const groupSelector = '[data-view-name="message-list-item"], .msg-s-message-group, .msg-s-message-list__event';
  const contactSelector = '.msg-thread__link-to-profile, .msg-entity-lockup__entity-title, .msg-conversation-card__participant-names, .msg-ThreadHeader h2, .msg-thread__heading, .msg-overlay-bubble-header__title';
  // Diagnostic counts contain no names, message text, or profile URLs.
  // This runs only when the user presses Read; it does not poll or fetch.
  const fail = message => ({ error: `${message} [RP-read-v4: items ${document.querySelectorAll(groupSelector).length}, bodies ${document.querySelectorAll('.msg-s-event-listitem__body').length}, headings ${document.querySelectorAll(contactSelector).length}, visible bodies ${[...document.querySelectorAll('.msg-s-event-listitem__body')].filter(visible).length}]` });
  // Locate the message list first: LinkedIn's full-page view does not always
  // include the older .msg-thread / .msg-convo-wrapper wrappers.
  const lists = [...document.querySelectorAll('.msg-s-message-list, .msg-s-message-list-content, .msg-s-message-list-container')].filter(el => visible(el) && el.querySelector(groupSelector));
  if (!lists.length) lists.push(...[...document.querySelectorAll(groupSelector)].filter(el => visible(el) && el.querySelector('.msg-s-event-listitem__body')));
  const innerLists = lists.filter(list => !lists.some(other => other !== list && list.contains(other)));
  const roots = innerLists.map(list => {
    let root = list;
    while (root.parentElement && root !== document.body) {
      if (root.querySelector(contactSelector)) return root;
      root = root.parentElement;
    }
    return null;
  }).filter(Boolean);
  if (!roots.length) {
    roots.push(...[...document.querySelectorAll('.msg-thread, .msg-convo-wrapper, .msg-conversation-card, .msg-convo-wrapper--full-height, .msg-overlay-conversation-bubble')].filter(el => visible(el) && el.querySelector(groupSelector) && el.querySelector(contactSelector)));
  }
  const unique = [...new Set(roots)];
  const usable = unique.filter(root => !unique.some(other => other !== root && root.contains(other)));
  if (usable.length !== 1) return fail(usable.length ? 'Multiple conversations detected. Open only one conversation on the messaging page.' : 'Could not identify an open conversation.');
  const root = usable[0];
  const normalizeName = value => value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const senderName = group => {
    const avatar = group.querySelector('.msg-s-event-listitem__profile-picture');
    return normalizeName(avatar?.getAttribute('title')?.trim() || avatar?.getAttribute('alt')?.trim() || text(group.querySelector('.msg-s-message-group__name')));
  };
  const headings = [...root.querySelectorAll(contactSelector)].filter(visible).map(el => normalizeName(text(el))).filter(Boolean);
  const knownNames = [...new Set([...root.querySelectorAll(groupSelector)].map(senderName).filter(Boolean))];
  // A participant's avatar gives the actual name, without heading badges,
  // presence labels, or accessible text such as "view profile".
  const matchingNames = knownNames.filter(name => headings.some(heading => {
    const padded = ` ${heading} `;
    return heading === name || padded.includes(` ${name} `);
  }));
  if (matchingNames.length > 1) return fail('Multiple senders match the conversation heading. Could not reliably identify the contact.');
  const contact = matchingNames[0] || headings[0];
  if (!contact) return fail('Could not find the contact name.');
  const messages = [];
  let inheritedSender = '';
  const groups = [...root.querySelectorAll(groupSelector)].filter(el => el.querySelector('.msg-s-event-listitem__body'));
  const items = groups.filter(group => !groups.some(other => other !== group && group.contains(other)));
  for (const group of items) {
    const sender = senderName(group);
    const self = group.classList.contains('msg-s-message-group--me') || group.classList.contains('msg-s-message-group--is-self') || group.classList.contains('msg-s-event-listitem--self');
    if (sender) inheritedSender = sender;
    else if (self) inheritedSender = 'You';
    for (const body of group.querySelectorAll('.msg-s-event-listitem__body')) {
      if (!visible(body) || !text(body)) continue;
      messages.push({ sender: inheritedSender || (self ? 'You' : 'Unknown'), role: self ? 'self' : (inheritedSender === contact ? 'contact' : 'unknown'), text: text(body).slice(0, 2000) });
    }
  }
  const recent = messages.slice(-10);
  const latest = [...recent].reverse().find(m => m.role === 'contact');
  if (!latest) return fail(`Could not reliably identify the latest contact message. Detected contact: ${contact.slice(0, 200)} / Senders: ${knownNames.map(name => name.slice(0, 200)).slice(0, 5).join(', ') || 'no names found'}`);
  return { contact: contact.slice(0, 200), messages: recent, latestMessage: latest.text };
})();
