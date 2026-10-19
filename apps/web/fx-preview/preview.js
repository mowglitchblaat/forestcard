// Injected at the end of the combat overlay page (apps/overlay-combat/src/combat.html, the author's
// code, untouched) to build fx-preview.html: the overlay's own effect animations, played on one card
// for the rules page. Loaded with ?demo: no Streamer.bot connection, no overlay lock, no database
// call. Calls the overlay's global functions (statut, souffle, auraFx…) as its demo catalog does.
(() => {
  // Effect → animation, taken from the overlay's demo catalog (the `S` list of its demo mode). Side 0
  // is the example card, which has the effect; side 1 its opponent. `on`: where the effect lands, the
  // card itself (self), its opponent (opponent), or both (both); the rules page shows it.
  const cardOf = (c) => $('#p' + c + ' .card');
  // An attack as the overlay plays a journal 'attaque' line (the attacker's card grows for 450 ms),
  // then what it triggers.
  const attack = (by, then) => {
    cardOf(by).classList.add('atk');
    setTimeout(() => {
      cardOf(by).classList.remove('atk');
      then();
    }, 450);
  };
  // A hit as the overlay plays a journal 'degats' line; pv: both cards' PV after it.
  const hit = (c, n, pv) => {
    maj({ pv, max: [70, 70], atq: [12, 12] });
    cardOf(c).classList.add('hit');
    flot(c, '-' + n, '#ff6a6a');
    setTimeout(() => cardOf(c).classList.remove('hit'), 450);
  };

  const PREVIEW = {
    poison: { on: 'opponent', play: (s, o) => statut(o, 'poison', true) },
    brulure: { on: 'opponent', play: (s, o) => statut(o, 'brulure', true) },
    saignement: { on: 'opponent', play: (s, o) => statut(o, 'saignement', true) },
    gel: { on: 'opponent', play: (s, o) => statut(o, 'gel', true) },
    etourdi: { on: 'opponent', play: (s, o) => statut(o, 'etourdi', true) },
    malediction: {
      on: 'opponent',
      play: (s, o) => {
        statut(o, 'malediction', true);
        cranes(o);
      },
    },
    fatigue: {
      on: 'opponent',
      play: (s, o) => {
        statut(o, 'fatigue', true);
        flot(o, 'Fatigue…', '#94a3b8');
      },
    },
    fracture: {
      on: 'opponent',
      play: (s, o) => {
        flot(o, '-4', '#fde68a');
        os(o);
      },
    },
    // The card executes: the marks land on the opponent.
    execution: {
      on: 'opponent',
      play: (s, o) => {
        lameIn(o, 1);
        flot(o, 'Marque 1/3', '#fca5a5');
        setTimeout(() => {
          lameIn(o, 2);
          flot(o, 'Marque 2/3', '#fca5a5');
        }, 1100);
        setTimeout(() => {
          lameIn(o, 3);
          flot(o, 'Marque 3/3', '#fca5a5');
        }, 2200);
        setTimeout(() => executionFx(o), 3900);
      },
    },
    // The card swallows the opponent (the demo shows it from the swallowed side).
    avalage: {
      on: 'opponent',
      play: (s, o) => {
        avMarque(o, 1);
        setTimeout(() => avMarque(o, 2), 1100);
        setTimeout(() => avalerFx(s, o), 2300);
        [0, 1, 2].forEach((i) => setTimeout(() => macherFx(s, o, i + 1, 3), 5600 + i * 1300));
        setTimeout(() => recracherFx(s, o), 9700);
      },
    },
    rage: {
      on: 'self',
      play: (s) => {
        statut(s, 'rage', true);
        colere(s);
        flot(s, 'RAGE !', '#ef4444', 'big');
      },
    },
    // Defences an attack triggers: the opponent attacks first, as the overlay plays the journal.
    esquive: {
      on: 'self',
      play: (s, o) =>
        attack(o, () => {
          flot(s, 'Esquive !', '#e5e7eb');
          vent(s);
        }),
    },
    // Partial block: the hit lands, reduced (12 ATQ, 50 % blocked).
    blocage: {
      on: 'self',
      play: (s, o) =>
        attack(o, () => {
          bouclier(s, { partiel: 1 });
          flot(s, 'Dégâts réduits', '#fcd34d');
          setTimeout(() => hit(s, 6, [64, 70]), 1500);
        }),
    },
    // The hit lands, then the mirror sends part of it back (25 %).
    renvoi: {
      on: 'self',
      play: (s, o) =>
        attack(o, () => {
          hit(s, 12, [58, 70]);
          setTimeout(() => {
            miroir(s, o);
            setTimeout(() => hit(o, 3, [58, 67]), 1150);
          }, 900);
        }),
    },
    soin: {
      on: 'self',
      play: (s) => {
        flot(s, '+15', '#4ade80');
        soin(s);
      },
    },
    purification: {
      on: 'self',
      play: (s) => {
        flot(s, 'Purifié !', '#fde047');
        purif(s);
      },
    },
    evite_mort: { on: 'self', play: (s) => ailes(s) },
    reanimation: {
      on: 'self',
      play: (s) => {
        briser(s);
        setTimeout(() => {
          reforme(s);
          flot(s, '+30', '#4ade80');
        }, 3100);
      },
    },
    // The card takes the opponent's ultimate.
    vol_ultime: {
      on: 'self',
      play: (s, o) => {
        volUlt(o, s);
        setTimeout(() => {
          const k = $('#p' + s + ' .card');
          k.classList.add('ult');
          auraFx(s);
          setTimeout(() => k.classList.remove('ult'), 2200);
        }, 1300);
      },
    },
    echange: { on: 'both', play: (s, o) => echangeLien(s, o, 'mixte') },
    transcendance: {
      on: 'self',
      play: (s) => {
        auraFx(s, { gold: 1 });
        aureole(s, { croix: false });
        statut(s, 'transc', true);
      },
    },
  };

  // Stops what a previous effect left running (as the demo's reset does).
  const reset = () => {
    fxAll.forEach((s) => s());
    fxAll.clear();
    fxL.length = 0;
    st = {};
    document.getAnimations().forEach((a) => a.cancel());
    document.querySelectorAll('canvas.fx').forEach((k) => k.remove());
  };

  window.fxPreview = {
    effects: Object.keys(PREVIEW),
    // card, opponent: { nom, image (storage path), rar: { nom, couleur, poids } }; no opponent: the
    // card alone (a rarity preview).
    show(card, opponent) {
      reset();
      const blank = { pseudo: '', magie: 'Aucune magie', piege: 'Aucun piège' };
      panneau(0, { ...blank, carte: card.nom, image: card.image, rar: card.rar });
      $('#p1').style.display = opponent ? '' : 'none';
      if (opponent)
        panneau(1, { ...blank, carte: opponent.nom, image: opponent.image, rar: opponent.rar });
      document.querySelectorAll('.dosf').forEach((d) => d.remove());
      maj({ pv: [70, 70], max: [70, 70], atq: [12, 12] });
      $('#scene').classList.add('on');
    },
    play(effect) {
      reset();
      // A replay starts from full PV again (an attack lowered them).
      maj({ pv: [70, 70], max: [70, 70], atq: [12, 12] });
      PREVIEW[effect]?.play(0, 1);
    },
  };
  parent.postMessage({ fxPreview: 'ready' }, location.origin);
})();
