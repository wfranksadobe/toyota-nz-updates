export default function decorate(block) {
  const col = block.firstElementChild;
  const pic = col.querySelector('picture');
  
  // Ensure the picture element is properly positioned for background display
  if (pic) {
    const picWrapper = pic.closest('div');
    if (picWrapper && picWrapper !== col) {
      // Move the picture to the main hero container for proper background positioning
      block.appendChild(pic);
      // Remove the now-empty wrapper if it exists
      if (picWrapper.children.length === 0) {
        picWrapper.remove();
      }
    }
  }

  // Get the text content div (usually the last div that's not the picture wrapper)
  const text = col.querySelector('div:not(:has(picture))') || col.querySelector('div:last-child');

  // Process text content and extract button information if present
  if (text) {
    const textContent = text.innerHTML;
    
    // Look for button markup patterns that might be added through the authoring interface
    const buttonRegex = /<p>.*?<a[^>]+class[^>]*button[^>]*>(.*?)<\/a>.*?<\/p>/gi;
    const buttonMatches = [...textContent.matchAll(buttonRegex)];
    
    if (buttonMatches.length > 0) {
      buttonMatches.forEach(match => {
        const fullMatch = match[0];
        const buttonText = match[1];
        
        // Extract href and class from the link
        const hrefMatch = fullMatch.match(/href="([^"]+)"/);
        const classMatch = fullMatch.match(/class="([^"]+)"/);
        
        const href = hrefMatch ? hrefMatch[1] : '#';
        const className = classMatch ? classMatch[1] : 'button primary';
        
        // Create new button element
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'hero-button-wrapper';
        
        const button = document.createElement('a');
        button.className = className;
        button.href = href;
        button.textContent = buttonText;
        
        buttonWrapper.appendChild(button);
        
        // Remove the original button markup from text
        text.innerHTML = text.innerHTML.replace(fullMatch, '');
        
        // Add the button wrapper after the text
        text.parentNode.appendChild(buttonWrapper);
      });
    }
    
    // Check if text is empty after button extraction and hide if so
    if (text.textContent.trim() === '') {
      text.style.display = 'none';
    }
  }

  // Handle direct button fields (for programmatic creation)
  const buttonData = extractButtonData(col);
  if (buttonData.text && buttonData.link) {
    createHeroButton(col, buttonData);
  }
}

/**
 * Extract button data from data attributes or structured content
 * @param {Element} col - The hero column element
 * @returns {Object} Button data object
 */
function extractButtonData(col) {
  // This would typically come from the AEM authoring interface
  // For now, we'll check for data attributes or specific structure
  return {
    text: col.dataset.buttonText || '',
    link: col.dataset.buttonLink || '',
    type: col.dataset.buttonType || 'primary'
  };
}

/**
 * Create and append a hero button
 * @param {Element} col - The hero column element
 * @param {Object} buttonData - Button configuration
 */
function createHeroButton(col, buttonData) {
  const existingButtonWrapper = col.querySelector('.hero-button-wrapper');
  if (existingButtonWrapper) {
    existingButtonWrapper.remove();
  }

  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'hero-button-wrapper';
  
  const button = document.createElement('a');
  button.className = `button ${buttonData.type}`;
  button.href = buttonData.link;
  button.textContent = buttonData.text;
  
  // Add click tracking if needed
  button.addEventListener('click', (e) => {
    // Add analytics or tracking here if needed
    console.log(`Hero button clicked: ${buttonData.text} -> ${buttonData.link}`);
  });
  
  buttonWrapper.appendChild(button);
  col.appendChild(buttonWrapper);
}
