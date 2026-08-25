// 导入所有业务脚本
import './js/api.js'
import './js/common.js'
import './js/xiaosong.js'

// 全局变量挂载，解决module模式下全局访问失效问题
window.App = App;
window.Xiaosong = Xiaosong;
window.Storage = Storage;

(function() {
  'use strict';

  // DOM
  var welcomeOverlay = document.getElementById('welcomeOverlay');
  var welcomeBtn = document.getElementById('welcomeBtn');
  var chatList = document.getElementById('chatList');
  var chatContent = document.getElementById('chatContent');
  var inputField = document.getElementById('inputField');
  var sendBtn = document.getElementById('sendBtn');
  var voiceBtn = document.getElementById('voiceBtn');
  var historyBtn = document.getElementById('historyBtn');
  var headerTitle = document.getElementById('headerTitle');
  var imageBtn = document.getElementById('imageBtn');
  var imageModeBar = document.getElementById('imageModeBar');
  var imageModeExit = document.getElementById('imageModeExit');
  var inputBar = document.getElementById('inputBar');

  // 画图模式
  var imageMode = false;

  /* ---- 初始化 ---- */
  function init() {
    App.init('chat');
    Xiaosong.init();

    if (Storage.isFirstLaunch()) {
      showWelcome();
    } else {
      renderHistory();
      if (Xiaosong.messages.length === 0) {
        addGreeting();
      }
    }
    bindEvents();
  }

  /* ---- 欢迎弹窗 ---- */
  function showWelcome() {
    welcomeOverlay.classList.add('show');
  }

  function hideWelcome() {
    welcomeOverlay.classList.add('hide');
    setTimeout(function() {
      welcomeOverlay.style.display = 'none';
    }, 400);
    Storage.markLaunched();
    addGreeting();
  }

  /* ---- 消息渲染 ---- */

  function addGreeting() {
    var msg = {
      role: 'assistant',
      content: '你好！我是晓松。有什么可以帮你的吗？',
      time: new Date().toISOString(),
    };
    Xiaosong.messages.push(msg);
    Storage.saveMessages('xiaosong', Xiaosong.messages);
    appendMessage(msg);
  }

  function renderHistory() {
    chatList.innerHTML = '';
    var messages = Xiaosong.getHistory();
    var lastTime = '';
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var timeStr = getTimeLabel(msg.time);
      if (timeStr && timeStr !== lastTime) {
        appendTimeSep(timeStr);
        lastTime = timeStr;
      }
      appendMessage(msg);
    }
    scrollToBottom();
  }

  function appendTimeSep(label) {
    var sep = document.createElement('div');
    sep.className = 'chat-time-sep';
    sep.innerHTML = '<span>' + label + '</span>';
    chatList.appendChild(sep);
  }

  function getTimeLabel(time) {
    if (!time) return '';
    var d = new Date(time);
    var now = new Date();
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var isToday = d.toDateString() === now.toDateString();
    if (isToday) return h + ':' + m;
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return '昨天 ' + h + ':' + m;
    }
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + h + ':' + m;
  }

  function appendMessage(msg) {
    var isUser = msg.role === 'user';
    var wrapper = document.createElement('div');
    wrapper.className = 'message ' + (isUser ? 'message-user' : 'message-xiaosong');

    var avatarHtml;
    if (isUser) {
      var user = Storage.getUser();
      var initial = user ? (user.username || '我').charAt(0) : '我';
      avatarHtml = '<div class="message-avatar">' + escapeHtml(initial) + '</div>';
    } else {
      avatarHtml = '<img class="message-avatar" src="assets/xiaosong-avatar.png" alt="晓松">';
    }

    var bubbleInner = '';

    if (msg.agentName) {
      bubbleInner += '<div class="message-agent-tag"><span class="tag-dot"></span>' + escapeHtml(msg.agentName) + '</div>';
    }

    bubbleInner += '<div class="message-text">' + renderText(msg.content) + '</div>';

    if (msg.routes) {
      for (var i = 0; i < msg.routes.length; i++) {
        var info = Xiaosong.getRouteInfo(msg.routes[i].tool, msg.routes[i].params);
        if (!info) continue;
        bubbleInner += '<div class="route-card" data-url="' + info.url + info.param + '">' +
          '<span class="route-card-text">' + escapeHtml(info.label) + '</span>' +
          '<span class="route-card-arrow">&rsaquo;</span>' +
          '</div>';
      }
    }

    wrapper.innerHTML =
      avatarHtml +
      '<div class="message-body">' +
      '<div class="message-bubble">' + bubbleInner + '</div>' +
      '</div>';

    if (msg.routes) {
      var cards = wrapper.querySelectorAll('.route-card');
      for (var j = 0; j < cards.length; j++) {
        (function(card) {
          card.addEventListener('click', function() {
            window.location.href = card.getAttribute('data-url');
          });
        })(cards[j]);
      }
    }

    chatList.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
  }

  function appendTyping() {
    var wrapper = document.createElement('div');
    wrapper.className = 'message message-xiaosong';
    wrapper.id = 'typingMsg';

    wrapper.innerHTML =
      '<img class="message-avatar" src="assets/xiaosong-avatar.png" alt="晓松">' +
      '<div class="message-body">' +
      '<div class="message-bubble message-bubble-loading">' +
      '<div class="message-loading-dots">' +
      '<span class="dot"></span>' +
      '<span class="dot"></span>' +
      '<span class="dot"></span>' +
      '</div>' +
      '</div>' +
      '</div>';

    chatList.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
  }

  function typingToMessage(typingEl, text, agentName, routes, images) {
    var bubble = typingEl.querySelector('.message-bubble');
    bubble.classList.remove('message-bubble-loading');
    bubble.innerHTML = '';

    if (agentName) {
      var tag = document.createElement('div');
      tag.className = 'message-agent-tag';
      tag.innerHTML = '<span class="tag-dot"></span>' + escapeHtml(agentName);
      bubble.appendChild(tag);
    }

    var textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.innerHTML = renderText(text);
    bubble.appendChild(textDiv);

    if (routes && routes.length > 0) {
      for (var i = 0; i < routes.length; i++) {
        var info = Xiaosong.getRouteInfo(routes[i].tool, routes[i].params);
        if (!info) continue;
        var card = document.createElement('div');
        card.className = 'route-card';
        card.innerHTML =
          '<span class="route-card-text">' + escapeHtml(info.label) + '</span>' +
          '<span class="route-card-arrow">&rsaquo;</span>';
        (function(card, url) {
          card.addEventListener('click', function() {
            window.location.href = url;
          });
        })(card, info.url + info.param);
        bubble.appendChild(card);
      }
    }

    if (images && images.length > 0) {
      for (var j = 0; j < images.length; j++) {
        (function(prompt) {
          var imgCard = document.createElement('div');
          imgCard.className = 'image-gen-card';
          imgCard.innerHTML =
            '<div class="image-gen-loading">' +
            '<div class="image-gen-spinner"></div>' +
            '<div class="image-gen-loading-text">正在为你绘制图片...</div>' +
            '<div class="image-gen-prompt">' + escapeHtml(prompt) + '</div>' +
            '</div>';
          bubble.appendChild(imgCard);

          Xiaosong.generateImage(prompt, function(url) {
            if (url) {
              imgCard.innerHTML =
                '<div class="image-gen-result">' +
                '<img class="image-gen-img" src="' + url + '" alt="' + escapeHtml(prompt) + '">' +
                '<div class="image-gen-actions">' +
                '<span class="image-gen-prompt-text">' + escapeHtml(prompt) + '</span>' +
                '<button class="image-gen-save-btn">保存图片</button>' +
                '</div>' +
                '</div>';
              var saveBtn = imgCard.querySelector('.image-gen-save-btn');
              if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                  downloadImage(url, prompt);
                });
              }
            } else {
              imgCard.innerHTML = '<div class="image-gen-error">图片生成失败</div>';
            }
          });
        })(images[j]);
      }
    }

    return textDiv;
  }

  function updateStreamingText(typingEl, fullText) {
    var bubble = typingEl.querySelector('.message-bubble');
    if (bubble.classList.contains('message-bubble-loading')) {
      bubble.classList.remove('message-bubble-loading');
      bubble.innerHTML = '<div class="message-text"></div>';
    }
    var textDiv = bubble.querySelector('.message-text');
    if (textDiv) {
      textDiv.innerHTML = renderText(fullText);
    }
    scrollToBottom();
  }

  /* ---- 画图模式 ---- */

  function toggleImageMode() {
    imageMode = !imageMode;
    if (imageMode) {
      inputBar.classList.add('image-mode');
      imageModeBar.classList.add('active');
      inputField.placeholder = '描述你想要的图片，比如：一只在月光下的橘猫...';
      inputField.focus();
    } else {
      inputBar.classList.remove('image-mode');
      imageModeBar.classList.remove('active');
      inputField.placeholder = '发消息...';
    }
    updateSendBtn();
  }

  function exitImageMode() {
    imageMode = false;
    inputBar.classList.remove('image-mode');
    imageModeBar.classList.remove('active');
    inputField.placeholder = '发消息...';
    updateSendBtn();
  }

  /* ---- 发送消息 ---- */

  function sendMessage() {
    var text = inputField.value.trim();
    if (!text || Xiaosong.isReplying) return;

    inputField.value = '';
    inputField.style.height = 'auto';
    updateSendBtn();

    // 画图模式：直接调用 CogView
    if (imageMode) {
      sendImageRequest(text);
      return;
    }

    var userMsg = {
      role: 'user',
      content: text,
      time: new Date().toISOString(),
    };
    appendMessage(userMsg);

    var typingEl = appendTyping();

    Xiaosong.sendMessage(text, {
      onUserMsg: function() {},
      onStart: function(agentName) {
        if (agentName) {
          headerTitle.textContent = agentName;
        } else {
          headerTitle.textContent = '我是晓松';
        }
      },
      onChunk: function(chunk, full) {
        updateStreamingText(typingEl, full);
      },
      onComplete: function(cleanText, agentName, routes, images) {
        typingToMessage(typingEl, cleanText, agentName, routes, images);
      },
      onError: function(errorMsg) {
        var bubble = typingEl.querySelector('.message-bubble');
        bubble.classList.remove('message-bubble-loading');
        bubble.innerHTML = '<div class="message-text" style="color:#FF3B30">' + escapeHtml(errorMsg) + '</div>';
      },
    });
  }

  /* ---- AI 画图请求 ---- */

  function sendImageRequest(prompt) {
    // 显示用户消息
    var userMsg = {
      role: 'user',
      content: '画一张：' + prompt,
      time: new Date().toISOString(),
    };
    appendMessage(userMsg);

    // 显示画图加载卡片
    var wrapper = document.createElement('div');
    wrapper.className = 'message message-xiaosong';
    wrapper.innerHTML =
      '<img class="message-avatar" src="assets/xiaosong-avatar.png" alt="晓松">' +
      '<div class="message-body">' +
      '<div class="message-bubble">' +
      '<div class="image-gen-card" id="imageGenCard">' +
      '<div class="image-gen-loading">' +
      '<div class="image-gen-spinner"></div>' +
      '<div class="image-gen-loading-text">正在为你绘制图片...</div>' +
      '<div class="image-gen-prompt">' + escapeHtml(prompt) + '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';
    chatList.appendChild(wrapper);
    scrollToBottom();

    var card = wrapper.querySelector('.image-gen-card');

    // 调用 CogView 生图
    ZhipuAPI.generateImage(prompt).then(function(url) {
      if (url) {
        card.innerHTML =
          '<div class="image-gen-result">' +
          '<img class="image-gen-img" src="' + url + '" alt="' + escapeHtml(prompt) + '">' +
          '<div class="image-gen-actions">' +
          '<span class="image-gen-prompt-text">' + escapeHtml(prompt) + '</span>' +
          '<button class="image-gen-save-btn">保存图片</button>' +
          '</div>' +
          '</div>';
        // 绑定保存按钮
        var saveBtn = card.querySelector('.image-gen-save-btn');
        saveBtn.addEventListener('click', function() {
          downloadImage(url, prompt);
        });
      } else {
        card.innerHTML = '<div class="image-gen-error">图片生成失败，请稍后重试</div>';
      }
    }).catch(function(err) {
      card.innerHTML = '<div class="image-gen-error">生成失败：' + escapeHtml(err.message || '未知错误') + '</div>';
    });

    scrollToBottom();
  }

  /* ---- 下载图片 ---- */

  function downloadImage(url, prompt) {
    // 尝试用 fetch 下载为 blob
    fetch(url).then(function(res) {
      return res.blob();
    }).then(function(blob) {
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'laswi_' + Date.now() + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }).catch(function() {
      // 降级：直接在新窗口打开
      window.open(url, '_blank');
    });
  }

  /* ---- 语音输入 ---- */

  var recognition = null;
  var isRecording = false;
  var voiceFinalText = '';
  var voiceOverlay = document.getElementById('voiceOverlay');
  var voiceStatus = document.getElementById('voiceStatus');
  var voiceText = document.getElementById('voiceText');
  var voiceCancelBtn = document.getElementById('voiceCancelBtn');
  var voiceShouldCancel = false;

  function initVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      recognition = new SR();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = function(e) {
        var interim = '';
        var final = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            final += e.results[i][0].transcript;
          } else {
            interim += e.results[i][0].transcript;
          }
        }
        if (final) {
          voiceFinalText += final;
        }
        var display = voiceFinalText + interim;
        if (display) {
          voiceText.textContent = display;
          voiceStatus.textContent = '识别中...';
        }
      };

      recognition.onerror = function(e) {
        if (e.error === 'no-speech') {
          voiceStatus.textContent = '没有听到声音';
        } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          voiceStatus.textContent = '请允许麦克风权限';
        } else if (e.error === 'network') {
          voiceStatus.textContent = '网络错误';
        } else {
          voiceStatus.textContent = '语音识别出错';
        }
        voiceText.textContent = '';
        isRecording = false;
        voiceBtn.classList.remove('recording');
        setTimeout(function() {
          hideVoiceOverlay();
        }, 1200);
      };

      recognition.onend = function() {
        isRecording = false;
        voiceBtn.classList.remove('recording');
        if (voiceShouldCancel) {
          hideVoiceOverlay();
          voiceShouldCancel = false;
          return;
        }
        var result = voiceFinalText.trim();
        if (result) {
          hideVoiceOverlay();
          inputField.value = result;
          updateSendBtn();
          autoResize();
          inputField.focus();
        } else {
          voiceStatus.textContent = '没有听到声音，再试一次';
          setTimeout(function() {
            hideVoiceOverlay();
          }, 1200);
        }
      };
    }
  }

  function showVoiceOverlay() {
    voiceOverlay.classList.add('show');
    voiceStatus.textContent = '正在聆听...';
    voiceText.textContent = '';
    voiceFinalText = '';
    voiceShouldCancel = false;
  }

  function hideVoiceOverlay() {
    voiceOverlay.classList.remove('show');
  }

  function toggleVoice() {
    if (!recognition) {
      voiceStatus.textContent = '当前浏览器不支持语音输入';
      showVoiceOverlay();
      setTimeout(function() {
        hideVoiceOverlay();
      }, 2000);
      return;
    }
    if (isRecording) {
      voiceShouldCancel = true;
      recognition.stop();
    } else {
      try {
        recognition.start();
        isRecording = true;
        voiceBtn.classList.add('recording');
        showVoiceOverlay();
      } catch (err) {
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceStatus.textContent = '启动失败，请重试';
        showVoiceOverlay();
        setTimeout(function() {
          hideVoiceOverlay();
        }, 1500);
      }
    }
  }

  /* ---- 工具函数 ---- */

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderText(text) {
    if (!text) return '';
    var html = escapeHtml(text);
    html = html.replace(/```([\s\S]*?)```/g, function(m, p1) {
      return '<pre>' + p1 + '</pre>';
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function updateSendBtn() {
    sendBtn.disabled = inputField.value.trim() === '';
  }

  function autoResize() {
    inputField.style.height = 'auto';
    inputField.style.height = Math.min(inputField.scrollHeight, 100) + 'px';
  }

  function scrollToBottom() {
    requestAnimationFrame(function() {
      chatContent.scrollTop = chatContent.scrollHeight;
    });
  }

  /* ---- 事件 ---- */

  function bindEvents() {
    welcomeBtn.addEventListener('click', hideWelcome);

    inputField.addEventListener('input', function() {
      updateSendBtn();
      autoResize();
    });

    inputField.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
    voiceBtn.addEventListener('click', toggleVoice);
    imageBtn.addEventListener('click', toggleImageMode);
    imageModeExit.addEventListener('click', exitImageMode);
    voiceCancelBtn.addEventListener('click', function() {
      voiceShouldCancel = true;
      if (recognition && isRecording) {
        recognition.stop();
      } else {
        hideVoiceOverlay();
      }
    });

    historyBtn.addEventListener('click', function() {
      if (confirm('确定清空所有对话记录吗？')) {
        Xiaosong.clearHistory();
        chatList.innerHTML = '';
        addGreeting();
      }
    });

    initVoice();
  }

  /* ---- 启动 ---- */
  document.addEventListener('DOMContentLoaded', init);
})();