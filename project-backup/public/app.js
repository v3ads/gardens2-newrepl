// Initialize when libraries are loaded
function initializeApp() {
  const { h, render } = preact;
  const { useState, useEffect, useRef } = preact;
  const html = htm.bind(h);

  // API utility functions
  const api = {
    async createSession() {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || 'Failed to create session');
      }
      
      return response.json();
    },

    async sendMessage(threadId, content) {
      const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          thread_id: threadId,
          content: content
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || 'Failed to send message');
      }

      return response.json();
    }
  };

  // Chat Message component
  function ChatMessage({ message }) {
    if (message.type === 'typing') {
      return html`
        <div class="message typing">
          Jasmine is typing${html`<div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>`}
        </div>
      `;
    }

    return html`
      <div class="message ${message.type}">
        ${message.content}
      </div>
    `;
  }

  // Chat interface component
  function ChatInterface() {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [threadId, setThreadId] = useState(null);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    // Initialize chat session
    useEffect(() => {
      initializeChat();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
      scrollToBottom();
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
      }
    }, [inputValue]);

    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const initializeChat = async () => {
      try {
        setError(null);
        
        // Add system welcome message
        setMessages([{
          id: Date.now(),
          type: 'system',
          content: "Hi, I'm Jasmine. Ask me about Cynthia Gardens policies, specials, and student options."
        }]);

        // Create chat session
        const session = await api.createSession();
        setThreadId(session.thread_id);
        
        console.log('Chat session initialized:', session.thread_id);
      } catch (err) {
        console.error('Failed to initialize chat:', err);
        setError('Failed to initialize chat session. Please refresh the page.');
      }
    };

    const sendMessage = async () => {
      if (!inputValue.trim() || isLoading || !threadId) return;

      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: inputValue.trim()
      };

      const typingMessage = {
        id: Date.now() + 1,
        type: 'typing',
        content: ''
      };

      // Add user message and typing indicator
      setMessages(prev => [...prev, userMessage, typingMessage]);
      const messageContent = inputValue.trim();
      setInputValue('');
      setIsLoading(true);
      setError(null);

      try {
        // Send message to API
        const response = await api.sendMessage(threadId, messageContent);
        
        // Remove typing indicator and add assistant response
        setMessages(prev => prev.filter(msg => msg.type !== 'typing'));
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'assistant',
          content: response.reply
        }]);

      } catch (err) {
        console.error('Failed to send message:', err);
        
        // Remove typing indicator
        setMessages(prev => prev.filter(msg => msg.type !== 'typing'));
        
        // Show error message
        setError(`Failed to send message: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    const retryLastMessage = () => {
      // Find the last user message and retry it
      const lastUserMessage = [...messages].reverse().find(msg => msg.type === 'user');
      if (lastUserMessage && threadId) {
        setError(null);
        setInputValue(lastUserMessage.content);
      }
    };

    return html`
      <div class="chat-container">
        <div class="chat-header">
          <h2>Jasmine • Chat Assistant</h2>
          <p>Your AI assistant for Cynthia Gardens information</p>
        </div>

        ${error && html`
          <div class="error-message">
            ${error}
            <button class="retry-button" onClick=${retryLastMessage}>
              Retry Last Message
            </button>
          </div>
        `}

        <div class="chat-messages">
          ${messages.map(message => html`
            <${ChatMessage} key=${message.id} message=${message} />
          `)}
          <div ref=${messagesEndRef}></div>
        </div>

        <div class="chat-input">
          <textarea
            ref=${textareaRef}
            value=${inputValue}
            onChange=${e => setInputValue(e.target.value)}
            onKeyPress=${handleKeyPress}
            placeholder="Ask me about Cynthia Gardens..."
            rows="1"
            disabled=${!threadId}
          ></textarea>
          <button
            class="send-button"
            onClick=${sendMessage}
            disabled=${!inputValue.trim() || isLoading || !threadId}
          >
            <i data-feather="send"></i>
          </button>
        </div>
      </div>
    `;
  }

  // Sidebar component
  function Sidebar({ activeModule, onModuleChange }) {
    const modules = [
      {
        id: 'jasmine',
        name: 'Jasmine • Assistant',
        icon: 'message-circle',
        enabled: true
      },
      {
        id: 'availability',
        name: 'Availability (soon)',
        icon: 'calendar',
        enabled: false
      },
      {
        id: 'reports',
        name: 'Reports (soon)',
        icon: 'bar-chart-2',
        enabled: false
      }
    ];

    return html`
      <div class="sidebar">
        <div class="sidebar-section">
          <h3>Tools</h3>
          ${modules.map(module => html`
            <button
              key=${module.id}
              class="sidebar-item ${activeModule === module.id ? 'active' : ''} ${!module.enabled ? 'disabled' : ''}"
              onClick=${() => module.enabled && onModuleChange(module.id)}
              disabled=${!module.enabled}
            >
              <i data-feather=${module.icon}></i>
              ${module.name}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  // Main App component
  function App() {
    const [activeModule, setActiveModule] = useState('jasmine');

    // Initialize Feather icons after render
    useEffect(() => {
      if (window.feather) {
        feather.replace();
      }
    });

    const renderMainContent = () => {
      switch (activeModule) {
        case 'jasmine':
          return html`<${ChatInterface} />`;
        default:
          return html`
            <div class="main-content">
              <div style="padding: 24px; text-align: center; color: #888;">
                <h2>Coming Soon</h2>
                <p>This module is under development.</p>
              </div>
            </div>
          `;
      }
    };

    return html`
      <div class="app-container">
        <header class="header">
          <h1>Cynthia Gardens Command Center</h1>
        </header>

        <${Sidebar}
          activeModule=${activeModule}
          onModuleChange=${setActiveModule}
        />

        <main class="main-content">
          ${renderMainContent()}
        </main>
      </div>
    `;
  }

  // Initialize the application
  console.log('Cynthia Gardens Command Center initializing...');
  render(html`<${App} />`, document.getElementById('app'));
}

// Wait for libraries to load before initializing
document.addEventListener('DOMContentLoaded', () => {
  // Check if libraries are loaded
  if (typeof preact !== 'undefined' && typeof htm !== 'undefined') {
    initializeApp();
  } else {
    // Wait a bit more for CDN libraries to load
    setTimeout(() => {
      if (typeof preact !== 'undefined' && typeof htm !== 'undefined') {
        initializeApp();
      } else {
        console.error('Required libraries (preact, htm) failed to load');
        document.getElementById('app').innerHTML = `
          <div class="loading">
            <p>Error: Failed to load required libraries. Please refresh the page.</p>
          </div>
        `;
      }
    }, 1000);
  }
});