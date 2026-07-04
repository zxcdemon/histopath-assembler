# Histotopogram Reconstruction

Инструмент для реконструкции цифровых макро-микропрепаратов (гистотопограмм)
из нескольких .mrxs / WSI-фрагментов: импорт, разметка маркеров туши,
регистрация, контроль качества, экспорт.

Проект состоит из двух независимых частей:

- **frontend** (этот репозиторий, TanStack Start / React / Vite) — UI,
  холст, работа с фрагментами, ghost-слой, сохранение проекта в JSON.
- **backend** (`backend/`, Python / FastAPI / OpenSlide / tifffile) —
  реальное чтение `.mrxs`, thumbnail/tiles, детекция ink-маркеров, расчёт
  `proposedTransforms`, метрики качества, экспорт OME-TIFF / BigTIFF.

> Backend НЕ работает внутри Lovable Cloud (Cloudflare Workers не даёт
> нативных бинарников и не даёт OpenSlide). Его нужно запускать локально
> или на своём сервере. Фронт продолжает работать без backend, но `.mrxs`
> будет помечен как «Модуль .mrxs недоступен. Запустите backend-сервис.»

---

## Быстрый старт (полный запуск)

```bash
docker compose config
docker compose up --build
curl http://localhost:8000/health
python -m py_compile backend/main.py
python -m py_compile backend/services/*.py

cp .env.example .env         # VITE_BACKEND_URL=http://localhost:8000
bun install
bun run dev
```

Откройте фронт (по умолчанию http://localhost:5173 / TanStack dev port).
Сверху появится зелёная плашка «Backend подключён» — значит `.mrxs`
пойдёт через OpenSlide, а `Экспорт` пишет реальный OME-TIFF.

Если плашка жёлтая («Модуль .mrxs недоступен») — backend не запущен
или недоступен по `VITE_BACKEND_URL`, и приложение работает только как
browser-only demo (PNG/JPG-фрагменты, без .mrxs, без OME-TIFF).

### Backend локально (без Docker)

Требует системный `openslide` (`apt install libopenslide0` /
`brew install openslide`).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Важные оговорки

- `.mrxs` **работает только через backend** с установленным OpenSlide.
- **Lovable Cloud backend не запускает** — Cloudflare Workers не даёт
  нативных бинарников и OpenSlide.
- Для реальных `.mrxs` лучше грузить **ZIP-архив** с `.mrxs`-файлом и
  сателлитной папкой `.dat` — эндпоинт `/cases/{id}/fragments/archive`
  распаковывает архив и подаёт `.mrxs` в OpenSlide вместе со всеми
  зависимыми файлами.
- Если backend не запущен, frontend работает как browser-only demo:
  обычные PNG/JPG кладутся на холст, `.mrxs` пропускается с честным
  сообщением «Для .mrxs нужно запустить backend с OpenSlide».

---

## Поддерживаемые форматы

- **Фрагменты**: `.mrxs`, `.svs`, `.ndpi`, `.tif/.tiff`, `.png`, `.jpg`, `.webp`.
  `.mrxs` требует backend с OpenSlide (папка-сателлит `.dat` должна лежать
  рядом с `.mrxs`).
- **Экспорт**: `PNG` (всегда), `OME-TIFF` и `BigTIFF` через backend
  (`tifffile` + JPEG compression, tiled 256×256).
- **Проект**: JSON snapshot (`GET /cases/{id}/project`).

---

## API

| Endpoint | Метод | Описание |
|---|---|---|
| `/health` | GET | Проверка доступности + флаг `openslide`. |
| `/cases` | POST | Создать case. |
| `/cases/{id}/fragments` | POST | Загрузить `.mrxs` или изображение. |
| `/cases/{id}/fragments/archive` | POST | Загрузить ZIP-архив с `.mrxs` + сателлитом. |
| `/cases/{id}/fragments` | GET | Список фрагментов с metadata (уровни, mpp). |
| `/fragments/{case}/{frag}/thumbnail` | GET | JPEG-превью. |
| `/fragments/{case}/{frag}/tile/{level}/{x}/{y}` | GET | Тайл 256×256 JPEG. |
| `/cases/{id}/detect-ink` | POST | Найти цветные штрихи туши по краям. |
| `/cases/{id}/register` | POST | `proposedTransforms` + `metrics`. |
| `/cases/{id}/transforms` | POST | Сохранить принятые transforms. |
| `/cases/{id}/preview` | POST | PNG-превью текущей сборки. |
| `/cases/{id}/export` | POST | OME-TIFF / BigTIFF / PNG. |
| `/cases/{id}/project` | GET | JSON snapshot проекта. |
| `/projects/import` | POST | Загрузить сохранённый snapshot. |

Все ответы CORS-friendly (`CORS_ORIGINS` env, по умолчанию `*`).

---

## Что реализовано

- ✅ Реальное чтение `.mrxs` через OpenSlide (dimensions, levels, mpp, thumbnail, tiles).
- ✅ Fallback на Pillow для обычных PNG/JPG/TIFF.
- ✅ Хранение case'ов на диске (`STORAGE_DIR`, по умолчанию `/data` в Docker).
- ✅ Детектор ink-маркеров по HSV в приграничной полосе фрагмента.
- ✅ Matching маркеров с учётом цвета, edge (top/right/bottom/left),
  противоположной стороны соседа и длины штриха.
- ✅ Rigid `proposedTransforms` из парных маркеров и контрольных точек.
- ✅ Метрики сборки: score, matchCount, errors, warnings, список стыков.
- ✅ Preview + Export PNG.
- ✅ OME-TIFF / BigTIFF экспорт через `tifffile` (tiled, JPEG).
- ✅ Save/Load проекта в JSON.
- ✅ Frontend: `backend-api.ts` подключён к основному workspace; `.mrxs` не
  импортируется как рабочий placeholder без backend, а при доступном backend
  загружается на сервер и отображается через реальный thumbnail.

## Ограничения прототипа

- Регистрация — **rigid** (translate + rotate + uniform scale). Non-rigid
  warping и feature-based (SIFT/SuperPoint) не реализованы.
- Overlap / gap считаются по bounding box. Считать по маске ткани — TODO
  (нужен сегментатор фона).
- OME-TIFF пишется в одном разрешении (не multi-resolution pyramid). Для
  полноценной пирамиды нужен `pyvips` (в Dockerfile закомментирован,
  можно включить и переписать `services/export.py` на `pyvips.Image.new_from_memory`).
- Мы **никогда** не дорисовываем ткань между фрагментами; пустые области
  остаются прозрачными.
- Аутентификации нет — backend рассчитан на локальный/внутренний запуск.

## Типовой сценарий

1. Запустить backend (`docker compose up`).
2. Открыть frontend, «Импорт» → выбрать `.mrxs` (или PNG-фрагменты).
   Файлы уходят на backend, обратно приходят metadata + thumbnail.
3. Раздел «Маркеры» — либо разметить туши вручную, либо нажать
   «Автоопределение» (`/detect-ink`).
4. Помощник → «Собрать автоматически» → backend возвращает
   `proposedTransforms` → пользователь применяет или отклоняет.
5. Помощник → «Показать подсказку» — показывает ghost-слой без изменения
   реальных координат.
6. Раздел «Просмотр» — итоговая сборка в едином масштабе.
7. «Экспорт» → OME-TIFF / BigTIFF / PNG.
