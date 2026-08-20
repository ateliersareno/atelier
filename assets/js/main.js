/* Atelier Sareno — site scripts */
(function () {
  "use strict";

  /* ---------- mobile nav ---------- */
  function initNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var nav = document.querySelector("[data-nav]");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- booking form ---------- */
  var STUDIO_ADDRESS = "734 Walt Whitman Road, Melville, NY 11747";
  var TIME_SLOTS = ["10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM", "4:00 PM", "5:30 PM"];
  var WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

  function initBooking() {
    var root = document.querySelector("[data-booking]");
    if (!root) return;

    var form = root.querySelector("[data-form]");
    var confirmation = root.querySelector("[data-confirmation]");
    var summaryEl = root.querySelector("[data-summary]");
    var calendarLink = root.querySelector("[data-calendar-link]");
    var resetBtn = root.querySelector("[data-reset]");
    var errorEl = root.querySelector("[data-error]");

    var monthLabel = root.querySelector("[data-month-label]");
    var grid = root.querySelector("[data-calendar-grid]");
    var weekdaysEl = root.querySelector("[data-calendar-weekdays]");
    var timesEl = root.querySelector("[data-calendar-times]");
    var prevBtn = root.querySelector("[data-prev-month]");
    var nextBtn = root.querySelector("[data-next-month]");

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var view = { year: today.getFullYear(), month: today.getMonth() };
    var selectedDate = null;
    var selectedTime = null;
var bookedTimes = [];
    fetch("/api/appointments")
  .then(function (res) {
    return res.json();
  })
  .then(function (data) {
    if (data && data.ok && Array.isArray(data.booked)) {
      bookedTimes = data.booked;
      renderTimeSlots();
      renderCalendar();
    }
  })
  .catch(function () {
    bookedTimes = [];
  });
    /* weekday header */
    WEEKDAYS.forEach(function (d) {
      var s = document.createElement("span");
      s.textContent = d;
      weekdaysEl.appendChild(s);
    });

    /* time slots */
    function renderTimeSlots() {
  timesEl.innerHTML = "";
  selectedTime = null;

  if (!selectedDate) return;

  TIME_SLOTS.forEach(function (label) {
    var m = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
    var hr = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === "PM") hr += 12;

    var slotDate = new Date(selectedDate.getTime());
    slotDate.setHours(hr, parseInt(m[2], 10), 0, 0);

    var isBooked = bookedTimes.some(function (booked) {
      return new Date(booked).getTime() === slotDate.getTime();
    });

    if (isBooked) return;

    var b = document.createElement("button");
    b.type = "button";
    b.className = "time-slot";
    b.textContent = label;

    b.addEventListener("click", function () {
      selectedTime = label;
      Array.prototype.forEach.call(timesEl.children, function (el) {
        el.classList.toggle("is-selected", el === b);
      });
      clearError();
    });

    timesEl.appendChild(b);
  });
}

    function clearError() {
      if (errorEl) errorEl.textContent = "";
    }

    function fail(message, field) {
      if (errorEl) errorEl.textContent = message;
      if (field && field.focus) field.focus();
    }

    function renderCalendar() {
      var first = new Date(view.year, view.month, 1);
      monthLabel.textContent = first.toLocaleString("en-US", { month: "long", year: "numeric" });
      grid.innerHTML = "";

      var offset = first.getDay();
      var daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

      for (var i = 0; i < offset; i++) {
        var blank = document.createElement("button");
        blank.type = "button";
        blank.className = "calendar__day is-empty";
        blank.disabled = true;
        blank.setAttribute("aria-hidden", "true");
        blank.tabIndex = -1;
        grid.appendChild(blank);
      }

      for (var d = 1; d <= daysInMonth; d++) {
        (function (day) {
          var dateObj = new Date(view.year, view.month, day);
          var isPast = dateObj < today;
          var isFull = TIME_SLOTS.every(function (label) {
  var m = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
  var hr = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") hr += 12;

  var slotDate = new Date(dateObj.getTime());
  slotDate.setHours(hr, parseInt(m[2], 10), 0, 0);

  return bookedTimes.some(function (booked) {
    return new Date(booked).getTime() === slotDate.getTime();
  });
});
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "calendar__day";
          btn.textContent = String(day);
          btn.disabled = isPast || isFull;
          if (selectedDate && dateObj.toDateString() === selectedDate.toDateString()) {
            btn.classList.add("is-selected");
          }
          btn.addEventListener("click", function () {
            selectedDate = dateObj;
            renderTimeSlots();
            renderCalendar();
            clearError();
          });
          grid.appendChild(btn);
        })(d);
      }
    }

    prevBtn.addEventListener("click", function () {
      view.month -= 1;
      if (view.month < 0) { view.month = 11; view.year -= 1; }
      renderCalendar();
    });

    nextBtn.addEventListener("click", function () {
      view.month += 1;
      if (view.month > 11) { view.month = 0; view.year += 1; }
      renderCalendar();
    });

    renderCalendar();

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    function toUtcStamp(date) {
      return date.getUTCFullYear() +
        pad(date.getUTCMonth() + 1) +
        pad(date.getUTCDate()) + "T" +
        pad(date.getUTCHours()) +
        pad(date.getUTCMinutes()) +
        pad(date.getUTCSeconds()) + "Z";
    }

    function buildStart() {
      if (!selectedDate || !selectedTime) return null;
      var m = selectedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) return null;
      var hr = parseInt(m[1], 10) % 12;
      if (m[3].toUpperCase() === "PM") hr += 12;
      var start = new Date(selectedDate.getTime());
      start.setHours(hr, parseInt(m[2], 10), 0, 0);
      return start;
    }

    function buildCalendarUrl(details) {
      var start = buildStart();
      if (!start) return "";
      var end = new Date(start.getTime() + 90 * 60000);
      var params = new URLSearchParams({
        action: "TEMPLATE",
        text: "Atelier Sareno — " + details.service,
        dates: toUtcStamp(start) + "/" + toUtcStamp(end),
        details: "Consultation with Atelier Sareno.\nService: " + details.service +
                 "\nLocation: " + details.place +
                 "\nName: " + details.name +
                 "\nPhone: " + details.phone +
                 (details.notes ? "\nNotes: " + details.notes : ""),
        location: details.place === "Atelier" ? STUDIO_ADDRESS : details.place
      });
      return "https://calendar.google.com/calendar/render?" + params.toString();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var phone = form.elements.phone.value.trim();

      if (!name) { fail("Please enter your name.", form.elements.name); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        fail("Please enter a valid email address.", form.elements.email); return;
      }
      if (phone.replace(/\D/g, "").length < 7) {
        fail("Please enter a valid phone number.", form.elements.phone); return;
      }
      if (!selectedDate || !selectedTime) {
        fail("Please choose a date and a time.", null);
        return;
      }

      var data = {
        name: name,
        email: email,
        phone: phone,
        service: form.elements.service.value,
        place: form.elements.place.value,
        notes: form.elements.notes.value.trim()
      };

      var start = buildStart();
      var dateStr = start.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric"
      });

      summaryEl.innerHTML = "";
      [
        ["Service", data.service],
        ["Date", dateStr],
        ["Time", selectedTime],
        ["Where", data.place],
        ["Name", data.name]
      ].forEach(function (row) {
        var line = document.createElement("div");
        line.textContent = row[0] + ": " + row[1];
        summaryEl.appendChild(line);
      });

      var url = buildCalendarUrl(data);

      var submitBtn = form.querySelector(".form__submit");
      clearError();
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      var end = new Date(start.getTime() + 90 * 60000);

      fetch("/api/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, data, {
          start: start.toISOString(),
          end: end.toISOString()
        }))
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok || !body.success) {
              throw new Error(body.error || "We couldn't send your request. Please try again or call us.");
            }
            return body;
          });
        })
        .then(function () {
    window.location.href = "/thank-you.html";
    bookedTimes.push(start.toISOString());
    renderTimeSlots();
    renderCalendar();
  
renderTimeSlots();
renderCalendar();
          if (url && calendarLink) {
            calendarLink.href = url;
            calendarLink.hidden = false;
          }
          form.hidden = true;
          confirmation.hidden = false;
          window.scrollTo({ top: root.offsetTop - 40, behavior: "smooth" });
        })
        .catch(function (err) {
          fail(err.message || "Something went wrong. Please try again.", null);
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = "Request appointment";
        });
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        form.reset();
        selectedDate = null;
        selectedTime = null;
        Array.prototype.forEach.call(timesEl.children, function (el) {
          el.classList.remove("is-selected");
        });
        renderCalendar();
        clearError();
        if (calendarLink) calendarLink.hidden = true;
        confirmation.hidden = true;
        form.hidden = false;
      });
    }
  }

  /* ---------- current year ---------- */
  function initYear() {
    var els = document.querySelectorAll("[data-year]");
    Array.prototype.forEach.call(els, function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initBooking();
    initYear();
  });
})();
