/**
 * Портреты динозавров для окна покупки.
 * Один файл на вид — действует на всех локациях с этим label.
 * Файлы: img/dinos/<slug>.png (прозрачный фон).
 */
(function () {
  /** @type {Record<string, string>} label → url */
  const DINO_PORTRAITS = {
    Компсогнат: 'img/dinos/compsognathus.png',
    Dimorphodon: 'img/dinos/dimorphodon.png',
    Pteranodon: 'img/dinos/pteranodon.png',
    Птеранодон: 'img/dinos/pteranodon.png',
    Atrociraptor: 'img/dinos/atrociraptor.png',
    Velociraptor: 'img/dinos/velociraptor.png',
    Велоцираптор: 'img/dinos/velociraptor.png',
    Carnotaurus: 'img/dinos/carnotaurus.png',
    Карнотавр: 'img/dinos/carnotaurus.png',
    Allosaurus: 'img/dinos/allosaurus.png',
    Аллозавр: 'img/dinos/allosaurus.png',
    Кетцалькоатль: 'img/dinos/quetzalcoatlus.png',
    Паразауролоф: 'img/dinos/parasaurolophus.png',
    Трицератопс: 'img/dinos/triceratops.png',
    Анкилозавр: 'img/dinos/ankylosaurus.png',
    Стегозавр: 'img/dinos/stegosaurus.png',
    Брахиозавр: 'img/dinos/brachiosaurus.png',
    Дилофозавр: 'img/dinos/dilophosaurus.png',
    Пирораптор: 'img/dinos/pyroraptor.png',
    Теризинозавр: 'img/dinos/therizinosaurus.png',
    Гиганотозавр: 'img/dinos/giganotosaurus.png',
    Гигантозавр: 'img/dinos/giganotosaurus.png',
    Тираннозавр: 'img/dinos/tyrannosaurus.png',
    Диметродон: 'img/dinos/dimetrodon.png',
    Спинозавр: 'img/dinos/spinosaurus.png',
    Мозазавр: 'img/dinos/mosasaurus.png',
    Титанозавр: 'img/dinos/titanosaurus.png',
    'Дистортус Рекс': 'img/dinos/distortus-rex.png',
    'Индоминус Рекс': 'img/dinos/indominus-rex.png',
    Мутадон: 'img/dinos/mutadon.png',
    'Морос интрепид': 'img/dinos/moros-intrepidus.png',
    Дейноних: 'img/dinos/deinonychus.png',
    Монолофозавр: 'img/dinos/monolophosaurus.png',
    Стигимолох: 'img/dinos/stygimoloch.png',
    Насутоцератопс: 'img/dinos/nasutoceratops.png',
    Синоцератопс: 'img/dinos/sinoceratops.png',
    Барионикс: 'img/dinos/baryonyx.png',
    Зухомим: 'img/dinos/suchomimus.png',
    Беклеспинакс: 'img/dinos/beckclespinax.png',
  };

  /** Порядок видов на Мальте — для сборки портретов */
  const MALTA_DINO_ORDER = [
    'Компсогнат',
    'Dimorphodon',
    'Pteranodon',
    'Atrociraptor',
    'Velociraptor',
    'Carnotaurus',
    'Allosaurus',
  ];

  /** Порядок видов на BioSyn (без уже собранных на других картах) */
  const BIOSYN_DINO_ORDER = [
    'Кетцалькоатль',
    'Паразауролоф',
    'Трицератопс',
    'Анкилозавр',
    'Стегозавр',
    'Брахиозавр',
    'Дилофозавр',
    'Пирораптор',
    'Теризинозавр',
    'Гиганотозавр',
    'Тираннозавр',
    'Диметродон',
  ];

  function getDinoPortraitUrl(label) {
    if (!label) return null;
    return DINO_PORTRAITS[label] || null;
  }

  window.GameData = window.GameData || {};
  window.GameData.DINO_PORTRAITS = DINO_PORTRAITS;
  window.GameData.MALTA_DINO_ORDER = MALTA_DINO_ORDER;
  window.GameData.BIOSYN_DINO_ORDER = BIOSYN_DINO_ORDER;
  window.GameData.getDinoPortraitUrl = getDinoPortraitUrl;
})();
