function placeholder() {}

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");
  if (!date) return;

  // Find the <li> with the matching date in the link
  const listItems = document.querySelectorAll("ul li[data-table]");
  let foundTableHtml = null;
  listItems.forEach((li) => {
    const a = li.querySelector("a");
    if (a && a.getAttribute("href") === `?date=${encodeURIComponent(date)}`) {
      foundTableHtml = li.getAttribute("data-table");
    }
  });
  if (foundTableHtml) {
    // Replace the first <table> in the document with the new HTML
    const table = document.querySelector("table");
    if (table) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = foundTableHtml;
      const newTable = wrapper.querySelector("table");
      if (newTable) {
        table.replaceWith(newTable);
      }
    }
  }
});
