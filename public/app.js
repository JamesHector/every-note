let allVenues = [];
let selectedVenues = [];
let allGenres = [];
let selectedGenres = [];
let currentUserName = null;
let currentView = 'grid';
let currentCalendarDate = new Date();

// Status progression and labels
const STATUS_ORDER = [null, 'interested', 'booked', 'going'];
const STATUS_LABELS = { interested: 'Interested', booked: 'Booked', going: 'Going' };
const STATUS_COLORS = { interested: '#f59e0b', booked: '#3b82f6', going: '#10b981' };

// localStorage management
function initializeUser() {
  currentUserName = localStorage.getItem('gigEveryNoteUserName');
  if (!currentUserName) {
    showNameModal();
  }
}

function showNameModal() {
  document.getElementById('nameModal').style.display = 'flex';
  document.getElementById('nameInput').focus();
  document.getElementById('nameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveName();
  });
}

function saveName() {
  const name = document.getElementById('nameInput').value.trim();
  if (name.length === 0) {
    alert('Please enter your name');
    return;
  }
  if (name.length > 100) {
    alert('Name is too long (max 100 characters)');
    return;
  }
  localStorage.setItem('gigEveryNoteUserName', name);
  currentUserName = name;
  document.getElementById('nameModal').style.display = 'none';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  initializeUser();
  await loadVenues();
  await loadGenres();

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

async function loadGenres() {
  try {
    const response = await fetch('/api/genres');
    allGenres = await response.json();
    renderGenreFilters();
  } catch (e) {
    console.error('Error loading genres:', e);
  }
}

function renderGenreFilters() {
  const container = document.getElementById('genreFilters');
  container.innerHTML = allGenres.map((genre, idx) => `
    <div class="genre-checkbox">
      <input
        type="checkbox"
        id="genre-${idx}"
        value="${genre}"
        onchange="toggleGenre(this)"
      >
      <label for="genre-${idx}">${genre}</label>
    </div>
  `).join('');
}

function renderVenueFilters() {
  const container = document.getElementById('venueFilters');
  container.innerHTML = allVenues.map((venue, idx) => `
    <div class="venue-checkbox">
      <input
        type="checkbox"
        id="venue-${idx}"
        value="${venue}"
        onchange="toggleVenue(this)"
      >
      <label for="venue-${idx}">${venue}</label>
    </div>
  `).join('');
}

function toggleGenre(checkbox) {
  const genre = checkbox.value;
  if (checkbox.checked) {
    selectedGenres.push(genre);
  } else {
    selectedGenres = selectedGenres.filter(g => g !== genre);
  }
  loadGigs();
}

function toggleVenue(checkbox) {
  const venue = checkbox.value;
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
    if (selectedGenres.length > 0) params.append('genres', selectedGenres.join(','));

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

  if (currentView === 'calendar') {
    renderCalendar(gigs);
    return;
  }

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
        <div id="interested-${gig.id}" class="gig-interested">👥 Loading...</div>
        <div class="gig-footer">
          ${gig.url ? `<a href="${escapeHtml(gig.url)}" target="_blank" class="btn btn-primary">Book Tickets</a>` : '<button class="btn btn-primary" disabled>No tickets link</button>'}
          <button id="status-btn-${gig.id}" class="btn btn-secondary" onclick="cycleStatus('${gig.id}')">Interested</button>
        </div>
      </div>
    `;
  }).join('');

  // Load interested users for each gig
  gigs.forEach(gig => {
    loadInterestedUsers(gig.id);
  });
}

function loadInterestedUsers(gigId) {
  fetch(`/api/interested/${gigId}`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById(`interested-${gigId}`);
      const statusBtn = document.getElementById(`status-btn-${gigId}`);

      if (data.interested && data.interested.length > 0) {
        // Build attendee list with statuses
        const attendeeList = data.interested
          .map(item => {
            const statusLabel = STATUS_LABELS[item.status] || 'Interested';
            return `${escapeHtml(item.userName)} (${statusLabel})`;
          })
          .join(', ');

        if (container) {
          container.innerHTML = `👥 ${attendeeList}`;
        }

        // Update current user's status button
        if (statusBtn && currentUserName) {
          const userStatus = data.interested.find(item => item.userName === currentUserName);
          if (userStatus) {
            const statusLabel = STATUS_LABELS[userStatus.status] || 'Interested';
            const statusColor = STATUS_COLORS[userStatus.status] || '#f0f0f0';
            statusBtn.textContent = statusLabel;
            statusBtn.style.background = statusColor;
            statusBtn.style.color = 'white';
            statusBtn.dataset.status = userStatus.status;
          } else {
            statusBtn.textContent = 'Interested';
            statusBtn.style.background = '#f0f0f0';
            statusBtn.style.color = '#555';
            statusBtn.removeAttribute('data-status');
          }
        }
      } else {
        if (statusBtn) {
          statusBtn.textContent = 'Interested';
          statusBtn.style.background = '#f0f0f0';
          statusBtn.style.color = '#555';
          statusBtn.removeAttribute('data-status');
        }
      }
    })
    .catch(e => console.error('Error loading interested users:', e));
}

function cycleStatus(gigId) {
  if (!currentUserName) {
    showNameModal();
    return;
  }

  const statusBtn = document.getElementById(`status-btn-${gigId}`);
  const currentStatus = statusBtn?.dataset.status || null;
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const nextIndex = (currentIndex + 1) % STATUS_ORDER.length;
  const nextStatus = STATUS_ORDER[nextIndex];

  if (nextStatus === null) {
    // Remove interest
    fetch(`/api/interested/${gigId}/${encodeURIComponent(currentUserName)}`, {
      method: 'DELETE'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadInterestedUsers(gigId);
        } else {
          console.error('Error removing interest:', data.error);
        }
      })
      .catch(e => console.error('Error:', e));
  } else {
    // Add or update interest with new status
    fetch('/api/interested', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gigId, userName: currentUserName, status: nextStatus })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadInterestedUsers(gigId);
        } else {
          console.error('Error updating interest:', data.error);
        }
      })
      .catch(e => console.error('Error:', e));
  }
}

function showAttendanceModal() {
  document.getElementById('attendanceModal').style.display = 'flex';
  loadAttendanceSummary();
}

function closeAttendanceModal() {
  document.getElementById('attendanceModal').style.display = 'none';
}

function loadAttendanceSummary() {
  fetch('/api/attendance-summary')
    .then(res => res.json())
    .then(data => {
      renderAttendanceTable(data.gigs, data.allNames);
    })
    .catch(e => console.error('Error loading attendance:', e));
}

function renderAttendanceTable(gigs, allNames) {
  const container = document.getElementById('attendanceTable');

  if (allNames.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999;">No one has marked interest yet</p>';
    return;
  }

  // Build HTML table
  let html = '<table class="attendance-table"><thead><tr><th>Gig</th>';
  allNames.forEach(name => {
    html += `<th>${escapeHtml(name)}</th>`;
  });
  html += '</tr></thead><tbody>';

  gigs.forEach(gig => {
    const date = new Date(gig.date);
    const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    const title = escapeHtml(gig.title.substring(0, 40));

    html += `<tr><td><strong>${title}</strong><br><span style="font-size: 0.85em; color: #999;">${dateStr}</span></td>`;

    allNames.forEach(name => {
      const interested = gig.interested.find(item => item.userName === name);
      if (interested) {
        const statusColor = STATUS_COLORS[interested.status] || '#f0f0f0';
        const statusLabel = STATUS_LABELS[interested.status] || 'Interested';
        html += `<td><span class="status-badge" style="background: ${statusColor};">${statusLabel}</span></td>`;
      } else {
        html += '<td></td>';
      }
    });

    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function resetDates() {
  const today = new Date();
  const threeMonthsAhead = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  document.getElementById('startDate').value = today.toISOString().split('T')[0];
  document.getElementById('endDate').value = threeMonthsAhead.toISOString().split('T')[0];

  loadGigs();
}

function toggleView(view) {
  currentView = view;
  const gridBtn = document.getElementById('gridViewBtn');
  const calBtn = document.getElementById('calViewBtn');
  const calNav = document.getElementById('calendarNav');

  if (gridBtn) gridBtn.classList.toggle('active', view === 'grid');
  if (calBtn) calBtn.classList.toggle('active', view === 'calendar');
  if (calNav) calNav.style.display = view === 'calendar' ? 'flex' : 'none';

  // For calendar view, load without date filters to show all gigs on calendar
  if (view === 'calendar') {
    loadCalendarGigs();
  } else {
    loadGigs();
  }
}

async function loadCalendarGigs() {
  try {
    const searchTerm = document.getElementById('searchBox').value;
    const params = new URLSearchParams();
    if (searchTerm) params.append('search', searchTerm);
    // No date range - show all gigs on calendar
    if (selectedVenues.length > 0) params.append('venues', selectedVenues.join(','));
    if (selectedGenres.length > 0) params.append('genres', selectedGenres.join(','));

    const response = await fetch(`/api/gigs?${params}`);
    const gigs = await response.json();

    renderGigs(gigs);
  } catch (e) {
    console.error('Error loading calendar gigs:', e);
    document.getElementById('gigsList').innerHTML = '<p class="empty-state">Error loading gigs</p>';
  }
}

function renderCalendar(gigs) {
  const container = document.getElementById('gigsList');
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Get the first day of the month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  // Month title
  const monthName = firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const calendarTitle = document.getElementById('calendarTitle');
  if (calendarTitle) calendarTitle.textContent = monthName;

  // Build calendar grid
  let html = '<div class="gigs-calendar"><div class="calendar-grid">';

  // Day headers
  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayHeaders.forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`;
  });

  // Empty cells before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += '<div class="calendar-day"></div>';
  }

  // Days of month with gigs
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const cellDateStr = cellDate.toISOString().split('T')[0];
    const daysGigs = gigs.filter(gig => gig.date.split('T')[0] === cellDateStr);

    html += `<div class="calendar-day">
      <div style="font-weight: 600; margin-bottom: 4px;">${day}</div>`;

    daysGigs.forEach(gig => {
      html += `<div class="calendar-chip" onclick="showGigPopup('${gig.id}')">${escapeHtml(gig.title.substring(0, 20))}</div>`;
    });

    html += '</div>';
  }

  html += '</div></div>';
  container.innerHTML = html;
}

function changeMonth(offset) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
  loadCalendarGigs();
}

function showGigPopup(gigId) {
  // In a real implementation, this would fetch gig details and show a popup
  // For now, we'll just log it
  console.log('Show popup for gig:', gigId);
}

function closeGigPopup() {
  document.getElementById('gigPopup').style.display = 'none';
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
