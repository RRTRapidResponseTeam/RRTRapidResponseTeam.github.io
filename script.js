const pages = [...document.querySelectorAll('.page')];
const nav = [...document.querySelectorAll('[data-page]')];

function openPage(id){
  pages.forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  window.scrollTo({top:0, behavior:'smooth'});
}

nav.forEach(el => el.addEventListener('click', () => openPage(el.dataset.page)));
document.querySelector('.course-btn')?.addEventListener('click', () => {
  alert('Тест будет подключён на следующем этапе. Сейчас это демонстрационная версия портала.');
});
