// Story Master - Quest & Narrative Engine

export class StoryMaster {
  constructor(dialogueSystem, audioMasterSystem) {
    this.dialogue = dialogueSystem;
    this.audioMaster = audioMasterSystem;
    this.bitManager = null;
    
    this.activeStoryId = 'Találd meg a tatai albérleted';
    this.currentStage = 0;
    this.isStoryComplete = false;
    this.isInsideApartment = false;

    // Apartment goal location in outdoor world coordinates
    this.apartment = {
      x: 2360,
      y: 388,
      width: 140,
      height: 180,
      reached: false,
      glowTimer: 0
    };

    // Interior ambiance timer
    this.fireTimer = 0;

    this.initStories();
  }

  initStories() {
    this.stories = {
      'Találd meg a tatai albérleted': {
        id: 'Találd meg a tatai albérleted',
        title: 'Találd meg a tatai albérleted',
        stages: [
          {
            stage: 0,
            task: 'Találd meg a tatai albérleted',
            dialogue: {
              id: 'dialog001',
              speaker: 'Narrátor',
              text: 'E Játék egy bizonyos karakterrel kezdődik. Az ő neve zsombor , akinek egyetlen célja hogy eljusson a gépéhez és streamelni kezdjen.'
            }
          },
          {
            stage: 1,
            task: 'Gyűjts össze 5 kristály bitet (0/5)!',
            dialogue: {
              id: 'dialog002',
              speaker: 'Főbérlő',
              text: 'Üdv Tatán! Az albérlet kauciójához szükség lesz 5 lila kristály bitre. Gyűjtsd össze őket az úton!'
            }
          },
          {
            stage: 2,
            task: 'Gyűjts össze 5 kristály bitet (0/5)!',
            dialogue: null
          },
          {
            stage: 3,
            task: 'Keresd meg és lépj be a tatai albérletbe!',
            dialogue: {
              id: 'dialog003',
              speaker: 'Zsombor',
              text: 'Megvan mind az 5 kristály bit! Most menjünk a tatai albérlethez a fasor végén.'
            }
          },
          {
            stage: 4,
            task: '🏆 KÜLDETÉS TELJESÍTVE: A tatai albérlet megvan!',
            dialogue: {
              id: 'dialog004',
              speaker: 'Narrátor',
              text: 'Gratulálok! Sikeresen beköltöztél a tatai albérletedbe! A gép beállítva, indulhat a ZsomBro stream! 🎮🎉'
            }
          }
        ]
      }
    };

    // Register all dialogues with Audio Master
    for (const story of Object.values(this.stories)) {
      for (const stage of story.stages) {
        if (stage.dialogue) {
          this.audioMaster.registerDialogue(stage.dialogue.id, {
            speaker: stage.dialogue.speaker,
            text: stage.dialogue.text,
            category: story.title
          });
        }
      }
    }
  }

  setBitManager(bm) {
    this.bitManager = bm;
    if (this.bitManager) {
      this.bitManager.setOnCollect((bit, collected, total) => {
        this.onBitCollected(collected, total);
      });
    }
  }

  start() {
    this.currentStage = 0;
    this.isStoryComplete = false;
    this.isInsideApartment = false;
    this.apartment.reached = false;
    this.updateTaskHUD();
    
    // Play opening dialogue 001 (Original Zsombor Intro)
    const stage0 = this.getStage(0);
    if (stage0 && stage0.dialogue) {
      this.dialogue.show({
        id: stage0.dialogue.id,
        speaker: stage0.dialogue.speaker,
        text: stage0.dialogue.text,
        duration: 8000,
        onDismiss: () => {
          if (this.currentStage === 0) {
            this.setStage(1);
          }
        }
      });
    }
  }

  getStage(stageIndex) {
    const story = this.stories[this.activeStoryId];
    return story ? story.stages[stageIndex] : null;
  }

  setStage(newStage) {
    this.currentStage = newStage;
    const stageData = this.getStage(newStage);
    if (!stageData) return;

    this.updateTaskHUD();

    if (stageData.dialogue) {
      this.dialogue.show({
        id: stageData.dialogue.id,
        speaker: stageData.dialogue.speaker,
        text: stageData.dialogue.text,
        duration: 8000,
        onDismiss: () => {
          if (this.currentStage === 1) {
            this.setStage(2);
          }
        }
      });
    }
  }

  onPlayerMove(playerX) {
    if (!this.isInsideApartment && this.currentStage === 0 && playerX > 580) {
      this.setStage(1);
    }
  }

  onBitCollected(collected, total) {
    if (this.currentStage === 1 || this.currentStage === 2) {
      this.currentStage = 2;
      const stageData = this.getStage(2);
      if (stageData) {
        stageData.task = `Gyűjts össze 5 kristály bitet (${collected}/${total})!`;
        this.updateTaskHUD();
      }

      if (collected >= total) {
        this.setStage(3);
      }
    }
  }

  checkApartmentInteraction(player) {
    if (this.isInsideApartment) {
      // Inside apartment checks
      if (player.x > 840) {
        return { canEnter: true, isExit: true, prompt: 'Nyomj [E] / Érintsd a kilépéshez!' };
      }
      if (player.x >= 580 && player.x <= 680) {
        return { canEnter: false, prompt: '🔥 Hangulatos tatai kandalló' };
      }
      if (player.x >= 380 && player.x <= 520) {
        return { canEnter: false, prompt: '🛋️ ZsomBro Streamer Kanapé' };
      }
      if (player.x < 240) {
        return { canEnter: false, prompt: '🍳 Tatai Konyha & Hűtő' };
      }
      return null;
    }

    // Outdoor checks
    const pX = player.x;
    const aptX = this.apartment.x;
    const dist = Math.abs(pX - aptX);

    if (dist < 100) {
      if (this.currentStage >= 3 || this.apartment.reached) {
        return { canEnter: true, isExit: false, prompt: 'Nyomj [E] / Érintsd a belépéshez!' };
      } else {
        return { canEnter: false, prompt: 'Még nincs meg az 5 kristály bit kaució!' };
      }
    }
    return null;
  }

  interactApartment(player) {
    const check = this.checkApartmentInteraction(player);
    if (!check || !check.canEnter) return false;

    if (this.isInsideApartment) {
      // Exit to outdoor
      this.isInsideApartment = false;
      player.x = 2300;
      player.y = 388;
      player.facingRight = false;
      return true;
    } else {
      // Enter the Tata House!
      this.isInsideApartment = true;
      this.apartment.reached = true;
      this.isStoryComplete = true;
      player.x = 880; // Start at entrance door on the right
      player.y = 388;
      player.facingRight = false;

      if (this.currentStage < 4) {
        this.setStage(4);
      }
      return true;
    }
  }

  update(dt, time) {
    this.apartment.glowTimer += dt * 3;
    this.fireTimer += dt * 4;
  }

  drawApartment(ctx, cameraX, player) {
    if (this.isInsideApartment) {
      // Draw interior interaction prompts if any
      const check = this.checkApartmentInteraction(player);
      if (check) {
        ctx.save();
        const pulse = Math.sin(this.fireTimer) * 3;
        const promptX = player.x - cameraX;
        const promptY = player.y - 145 + pulse;

        ctx.fillStyle = check.canEnter ? '#22c55e' : 'rgba(22, 27, 34, 0.92)';
        ctx.fillRect(promptX - 110, promptY - 12, 220, 24);
        ctx.strokeStyle = check.canEnter ? '#ffffff' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(promptX - 110, promptY - 12, 220, 24);

        ctx.fillStyle = '#ffffff';
        ctx.font = '7.5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(check.prompt, promptX, promptY);
        ctx.restore();
      }
      return;
    }

    // Outdoor Tata House rendering
    const apt = this.apartment;
    const sx = apt.x - cameraX;
    const sy = apt.y; // Ground level

    ctx.save();

    // Shadow under building
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(sx, sy - 4, apt.width / 1.7, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tata House Base / Walls
    const houseW = 150;
    const houseH = 140;
    const houseLeft = sx - houseW / 2;
    const houseTop = sy - houseH;

    // Building Wall (Charming brick & timber)
    ctx.fillStyle = '#e8d8c3';
    ctx.fillRect(houseLeft, houseTop, houseW, houseH);
    ctx.strokeStyle = '#614126';
    ctx.lineWidth = 4;
    ctx.strokeRect(houseLeft, houseTop, houseW, houseH);

    // Roof (Terracotta Hungarian style roof)
    ctx.fillStyle = '#b84a28';
    ctx.beginPath();
    ctx.moveTo(houseLeft - 16, houseTop);
    ctx.lineTo(sx, houseTop - 50);
    ctx.lineTo(houseLeft + houseW + 16, houseTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6c220e';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Wooden Door
    const doorW = 38;
    const doorH = 68;
    const doorX = sx - doorW / 2;
    const doorY = sy - doorH;
    ctx.fillStyle = '#784315';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.strokeStyle = '#3e2008';
    ctx.lineWidth = 3;
    ctx.strokeRect(doorX, doorY, doorW, doorH);
    // Door handle
    ctx.fillStyle = '#f6d860';
    ctx.beginPath();
    ctx.arc(doorX + doorW - 8, doorY + doorH / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Windows
    const drawWindow = (wx, wy) => {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(wx, wy, 28, 28);
      ctx.strokeStyle = '#382010';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, 28, 28);
      // Window panes
      ctx.beginPath();
      ctx.moveTo(wx + 14, wy);
      ctx.lineTo(wx + 14, wy + 28);
      ctx.moveTo(wx, wy + 14);
      ctx.lineTo(wx + 28, wy + 14);
      ctx.stroke();
    };
    drawWindow(houseLeft + 14, houseTop + 30);
    drawWindow(houseLeft + houseW - 42, houseTop + 30);

    // Signboard: "🏡 TATAI ALBÉRLET"
    const signW = 130;
    const signH = 22;
    const signX = sx - signW / 2;
    const signY = houseTop - 26;
    ctx.fillStyle = '#2d1b0d';
    ctx.fillRect(signX, signY, signW, signH);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(signX, signY, signW, signH);

    ctx.fillStyle = '#fef08a';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TATAI ALBÉRLET', sx, signY + signH / 2);

    // Interaction prompt if player is nearby
    const check = this.checkApartmentInteraction(player);
    if (check) {
      const pulse = Math.sin(this.apartment.glowTimer) * 4;
      const promptY = houseTop - 64 + pulse;

      ctx.fillStyle = check.canEnter ? '#22c55e' : '#f59e0b';
      ctx.fillRect(sx - 120, promptY - 14, 240, 26);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 120, promptY - 14, 240, 26);

      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(check.prompt, sx, promptY);
    }

    ctx.restore();
  }

  updateTaskHUD() {
    const titleElem = document.getElementById('task-story-title');
    const descElem = document.getElementById('task-description');
    const hudContainer = document.getElementById('task-hud');

    const stageData = this.getStage(this.currentStage);
    if (titleElem) titleElem.textContent = this.activeStoryId;
    if (descElem && stageData) {
      descElem.textContent = stageData.task;
    }

    if (hudContainer) {
      hudContainer.classList.add('task-pulse');
      setTimeout(() => hudContainer.classList.remove('task-pulse'), 800);
    }
  }

  reset() {
    this.currentStage = 0;
    this.isStoryComplete = false;
    this.isInsideApartment = false;
    this.apartment.reached = false;
    if (this.bitManager) this.bitManager.reset();
    this.start();
  }
}
