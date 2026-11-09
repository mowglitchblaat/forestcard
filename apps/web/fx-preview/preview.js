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
    glas: {
      on: 'opponent',
      play: (s, o) => {
        glasBarre(o, null, 3);
        glasCloche(o);
        flot(o, '🔔 Le Glas sonne', '#c4b5fd');
        [15, 30, 45, 60].forEach((x, i) => setTimeout(() => glasBarre(o, x), 800 * (i + 1)));
      },
    },
    solidification: {
      on: 'self',
      play: (s) => {
        statut(s, 'solide', true);
        flot(s, 'Solidifié !', '#d6d3d1');
      },
    },
    // The opponent attacks; its attack is cancelled.
    annule: {
      on: 'self',
      play: (s, o) =>
        attack(o, () => {
          annuleFx(o);
          flot(o, 'Attaque annulée', '#fca5a5');
        }),
    },
    degats: { on: 'opponent', play: (s, o) => hit(o, 12, [70, 58]) },
    stats: {
      on: 'both',
      play: (s, o) => {
        fleches(s, 'ATQ', 4);
        setTimeout(() => fleches(o, 'ATQ', -4), 900);
      },
    },
    detonation: {
      on: 'opponent',
      play: (s, o) => {
        detoFx(o, ['brulure', 'poison', 'saignement']);
        setTimeout(() => flot(o, 'DÉTONATION !', '#fb923c', 'big'), 260);
      },
    },
    souffle: { on: 'opponent', play: (s, o) => souffle(s, o, 'brulure') },
    programmation: {
      on: 'self',
      play: (s) => {
        progFx(s, 'p');
        flot(s, 'Passif programmé', '#7dd3fc');
        setTimeout(() => {
          activFx(s);
          flot(s, 'ACTIVATION !', '#38bdf8', 'big');
        }, 1800);
      },
    },
    headshot: { on: 'opponent', play: (s, o) => nHeadshot(s, o) },
    ciblage: {
      on: 'opponent',
      play: (s, o) => {
        nCible(o, true);
        flot(o, 'CIBLÉ', '#ff3b30');
      },
    },
    // The opponent carries the link: its heals feed the card.
    lien: {
      on: 'both',
      play: (s, o) => {
        nLien(o, s, true, 1);
        flot(o, 'Lien parasitaire', '#fda4af');
      },
    },
    mutation: {
      on: 'self',
      play: (s) => [1, 2, 3].forEach((n, i) => setTimeout(() => nMutation(s, n), 1600 * i)),
    },
    mue: {
      on: 'self',
      play: (s) => {
        nMueDebut(s);
        setTimeout(() => nMue(s), 1600);
      },
    },
    brume: {
      on: 'self',
      play: (s) => {
        nBrume(s, 1);
        setTimeout(() => nBrumeBloque(s, 'poison'), 1300);
      },
    },
    cisaillement: {
      on: 'opponent',
      play: (s, o) => {
        nLamesPose(o, 3);
        NP[o].lames = 3;
        nLamesSync(o, 3);
        setTimeout(() => {
          NP[o].lames = 0;
          nCisaille(o, false);
        }, 1900);
      },
    },
    critique: { on: 'opponent', play: (s, o) => nCritique(s, o, 12) },
    foudre: {
      on: 'opponent',
      play: (s, o) => {
        nFoudre(o, 1);
        setTimeout(() => nFoudreCoup(o, 8), 1100);
      },
    },
    surcharge: {
      on: 'self',
      play: (s) => {
        NP[s].surcharge = true;
        nSurcharge(s);
      },
    },
    accumulateur: {
      on: 'self',
      play: (s) => {
        [1, 2, 3].forEach((n) => setTimeout(() => nVolt(s, n, n === 3), 700 * (n - 1)));
        setTimeout(() => nDecharge(s), 2100);
      },
    },
    sedimentation: {
      on: 'self',
      play: (s) => {
        [1, 2, 3].forEach((n) => setTimeout(() => nCouche(s, n), 600 * (n - 1)));
        setTimeout(() => {
          nBouclierPierre(s, 24);
          NP[s].bouclier = 24;
          nfxStart();
        }, 1800);
        setTimeout(() => nBouclierEncaisse(s, 10), 3000);
      },
    },
    replique: {
      on: 'opponent',
      play: (s, o) => {
        [1, 2, 3].forEach((n) => setTimeout(() => nChargeTerre(s, n), 500 * (n - 1)));
        setTimeout(() => nReplique(s, o, false), 1500);
      },
    },
    enracinement: {
      on: 'opponent',
      play: (s, o) => {
        nRacines(o, 'epineux');
        nRacinesSync(o, true);
      },
    },
    contamination: { on: 'opponent', play: (s, o) => nContamine(o) },
    embrasement: {
      on: 'self',
      play: (s) => {
        statut(s, 'rage', true);
        nEmbrase(s);
        NP[s].embrase = true;
        nfxStart();
        flot(s, 'EMBRASEMENT !', '#fb923c', 'big');
      },
    },
    fureur: {
      on: 'self',
      play: (s) => [5, 10, 15].forEach((n, i) => setTimeout(() => nFureur(s, true, n), 650 * i)),
    },
    // The opponent is poisoned; the card drinks part of each tick.
    sangsue: {
      on: 'self',
      play: (s, o) => {
        statut(o, 'poison', true);
        setTimeout(() => {
          nSangsue(s, o);
          setTimeout(() => {
            flot(s, '+5', '#4ade80');
            soin(s);
          }, 900);
        }, 500);
      },
    },
    injection: { on: 'opponent', play: (s, o) => nInjection(o, s, 'laid') },
    etreinte: {
      on: 'opponent',
      play: (s, o) => {
        nEtreinte(s);
        setTimeout(() => {
          nEtreinteSerre(o);
          fleches(o, 'ATQ', -2);
        }, 900);
      },
    },
    brisure: { on: 'opponent', play: (s, o) => nBrisure(o, true) },
    forge: {
      on: 'self',
      play: (s) =>
        [1, 2, 3].forEach((n) =>
          setTimeout(
            () => {
              nForge(s, n);
              forgeBadge(s, 'fighter', n);
            },
            1300 * (n - 1),
          ),
        ),
    },
    // Living weapon: fire forges it (twice, at 50 %), up to 6 forges.
    arme_vivante: {
      on: 'self',
      play: (s) => {
        flot(s, '🔥 Le feu la forge !', '#fb923c', 'big');
        nForge(s, 1, 'fighter', 6);
        forgeBadge(s, 'fighter', 1);
        setTimeout(() => {
          nForge(s, 3, 'fighter', 6);
          forgeBadge(s, 'fighter', 3);
        }, 1300);
      },
    },
    // The card shatters, then rebuilds itself (70 % of its HP the first time).
    reconstruction: {
      on: 'self',
      play: (s) => {
        briser(s);
        setTimeout(() => {
          reforme(s);
          flot(s, '🔧 Reconstruction (70 %)', '#4ade80');
        }, 3100);
      },
    },
    // A scythe tears a wounded target; a laser pierces a target at full HP.
    fauche: {
      on: 'opponent',
      play: (s, o) =>
        attack(s, () => {
          nFauche(s, o, 18, 75);
          setTimeout(() => hit(o, 30, [70, 10]), 350);
        }),
    },
    laser: {
      on: 'opponent',
      play: (s, o) =>
        attack(s, () => {
          nLaser(s, o, 12, 100);
          setTimeout(() => hit(o, 24, [70, 46]), 450);
        }),
    },
    // Threads land on the opponent, up to 5; then the puppeteer's hand takes it.
    fils: {
      on: 'opponent',
      play: (s, o) => {
        [1, 3, 5].forEach((n, i) => setTimeout(() => nFils(o, n, 5), 1100 * i));
        setTimeout(() => {
          ctrlBadge(o, true);
          nflash(o, '#e879f9', 700);
          flot(o, 'MARIONNETTE !', '#e879f9', 'big');
        }, 3300);
      },
    },
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
    // What some effects leave on the card: the forge hammer, the puppeteer's hand, the knell's
    // shadow, the swallow's fork and knife, the execution's blades.
    document
      .querySelectorAll('.forgeb, .ctrlb, .bar .glas, .avm, .lame')
      .forEach((k) => k.remove());
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
