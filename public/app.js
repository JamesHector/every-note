let allVenues = [];
let selectedVenues = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadVenues();
  await loadGigs();

  // Setup event listeners
  document.getElementById('searchBox').addEventListener('input', debounce(loadGigs, 300));
  document.getElementById('startDate').addEventListener('change', loadGigs);
  document.getElementById('endDate').addEventListener('change', loadGigs);

  // Set default date range (today to 3 months ahead)
  const today = new Date();
  const threeMonthsAhead = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  document.getElementById('startDate').value = today.toISOString().split('T')[0];
  document.getElementById('endDate').value = threeMonthsAhead.toISOString().split('T')[0];

  await loadGigs();
});

async function loadVenues() {
  try {
    const response = await fetch('/api/venues');
    allVenues = await response.json();
    renderVenueFilters();
  } catch (e) {
    console.error('Error loading venues:', e);
  }
}

function renderVenueFilters() {
  const container = document.getElementById('venueFilters');
  container.innerHTML = allVenues.map(venue => `
    <div class="venue-checkbox">
      <input
        type="checkbox"
        id="venue-${venue}"
        value="${venue}"
        onchange="toggleVenue('${venue}')"
      >
      <label for="venue-${venue}">${venue}</label>
    </div>
  `).join('');
}

function toggleVenue(venue) {
  const checkbox = document.getElementById(`venue-${venue}`);
  if (checkbox.checked) {
    selectedVenues.push(venue);
  } else {
    selectedVenues = selectedVenues.filter(v => v !== venue);
  }
  loadGigs();
}

async function loadGigs() {
  try {
    const searchTerm = document.getElementById('searchBox').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    const params = new URLSearchParams();
    if (searchTerm) params.append('search', searchTerm);
    if (startDate) params.append('startDate', startDate + 'T00:00:00Z');
    if (endDate) params.append('endDate', endDate + 'T23:59:59Z');
    if (selectedVenues.length > 0) params.append('venues', selectedVenues.join(','));

    const response = await fetch(`/api/gigs?${params}`);
    const gigs = await response.json();

    renderGigs(gigs);
  } catch (e) {
    console.error('Error loading gigs:', e);
    document.getElementById('gigsList').innerHTML = '<p class="empty-state">Error loading gigs</p>';
  }
}

function renderGigs(gigs) {
  const container = document.getElementById('gigsList');

  if (gigs.length === 0) {
    container.innerHTML = '<p class="empty-state">No gigs found. Try adjusting your filters!</p>';
    return;
  }

  container.innerHTML = gigs.map(gig => {
    const date = new Date(gig.date);
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="gig-card">
        <div class="gig-title">${escapeHtml(gig.title)}</div>
        <div class="gig-venue">${escapeHtml(gig.venue)}</div>
        <div class="gig-date">
          📅 ${dateStr}
          <span style="color: #999;">at ${timeStr}</span>
        </div>
        ${gig.category ? `<div class="gig-category">${escapeHtml(gig.category)}</div>` : ''}
        <div class="gig-source">${escapeHtml(gig.source)}</div>
        <div class="gig-footer">
          ${gig.url ? `<a href="${escapeHtml(gig.url)}" target="_blank" class="btn btn-primary">Book Tickets</a>` : '<button class="btn btn-primary" disabled>No tickets link</button>'}
          <button class="btn btn-secondary" onclick="addToInterest('${escapeHtml(gig.title)}')">Interested</button>
        </div>
      </div>
    `;
  }).join('');
}

function addToInterest(gigTitle) {
  // TODO: Implement in Phase 3
  alert(`Marked "${gigTitle}" as interested (feature coming soon)`);
}

function resetDates() {
  const today = new Date();
  const threeMonthsAhead = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  document.getElementById('startDate').value = today.toISOString().split('T')[0];
  document.getElementById('endDate').value = threeMonthsAhead.toISOString().split('T')[0];

  loadGigs();
}

function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
