import { 
  Button, 
  Icon, 
  provider as UI 
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';
import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { 
  fetchPlaceholders,
  rootLink 
} from '../../scripts/commerce.js';

// Import initializers
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/pdp.js';
import '../../scripts/initializers/wishlist.js';

export default async function decorate(block) {
  // Get configuration from block attributes
  const config = readBlockConfig(block);
  const {
    sku,
    layout = 'card',
    showprice = true,
    showaddtocart = true,
    showwishlist = false,
    showstock = true
  } = config;

  if (!sku) {
    renderError(block, 'Product SKU is required');
    return;
  }

  // Get labels for internationalization
  const labels = await fetchPlaceholders();

  // Add loading state and layout class
  block.classList.add('product-configurator--loading');
  block.classList.add(`product-configurator--${layout}`);

  // Create basic structure
  block.innerHTML = `
    <div class="product-configurator__image">
      <div class="loading-placeholder"></div>
    </div>
    <div class="product-configurator__content">
      <div class="product-configurator__title loading-placeholder"></div>
      <div class="product-configurator__sku loading-placeholder"></div>
      ${showprice ? '<div class="product-configurator__price loading-placeholder"></div>' : ''}
      <div class="product-configurator__short-description loading-placeholder"></div>
      <div class="product-configurator__options"></div>
      ${showstock ? '<div class="product-configurator__stock-status"></div>' : ''}
      ${(showaddtocart || showwishlist) ? '<div class="product-configurator__actions"></div>' : ''}
    </div>
  `;

  try {
    // Fetch complex product data
    const product = await pdpApi.fetchProductData(sku);
    
    if (!product) {
      throw new Error(`Product with SKU ${sku} not found`);
    }

    // Check if this is a complex product with options
    if (!product.options || product.options.length === 0) {
      throw new Error(`Product ${sku} is not a configurable product with options`);
    }

    // Remove loading state
    block.classList.remove('product-configurator--loading');

    // Initialize product state
    const productState = {
      product,
      selectedOptions: new Map(),
      currentImage: null,
      currentVariant: null
    };

    // Render product configurator
    await renderProductConfigurator(block, productState, config, labels);

  } catch (error) {
    console.error('Error loading product configurator:', error);
    renderError(block, `Error loading product: ${error.message}`);
  }
}

async function renderProductConfigurator(block, productState, config, labels) {
  const { showprice, showaddtocart, showwishlist, showstock, layout } = config;
  const { product } = productState;
  
  // Get DOM elements
  const imageContainer = block.querySelector('.product-configurator__image');
  const titleElement = block.querySelector('.product-configurator__title');
  const skuElement = block.querySelector('.product-configurator__sku');
  const priceElement = block.querySelector('.product-configurator__price');
  const shortDescElement = block.querySelector('.product-configurator__short-description');
  const optionsContainer = block.querySelector('.product-configurator__options');
  const stockElement = block.querySelector('.product-configurator__stock-status');
  const actionsContainer = block.querySelector('.product-configurator__actions');

  // Render initial product image
  await renderProductImage(imageContainer, product, productState);

  // Render product title
  renderProductTitle(titleElement, product);
  
  // Render product SKU
  renderProductSku(skuElement, product, productState);

  // Render price
  if (showprice && priceElement) {
    renderProductPrice(priceElement, product, productState);
  } else if (priceElement) {
    priceElement.remove();
  }

  // Render short description
  renderShortDescription(shortDescElement, product);

  // Render product options (color swatches, etc.)
  renderProductOptions(optionsContainer, product, productState, block);

  // Render stock status
  if (showstock && stockElement) {
    renderStockStatus(stockElement, product, productState);
  } else if (stockElement) {
    stockElement.remove();
  }

  // Render actions (Add to Cart and Wishlist)
  if (actionsContainer && (showaddtocart || showwishlist)) {
    await renderProductActions(actionsContainer, product, productState, config, labels);
  }
}

async function renderProductImage(container, product, productState) {
  if (!product.images || product.images.length === 0) {
    container.innerHTML = '<div class="product-configurator__no-image">No Image</div>';
    return;
  }

  const currentImage = productState.currentImage || findMainProductImage(product);
  
  if (currentImage) {
    const img = document.createElement('img');
    img.src = currentImage.url;
    img.alt = product.name;
    img.loading = 'lazy';
    img.width = currentImage.width || 400;
    img.height = currentImage.height || 400;
    
    // Add click handler to navigate to PDP
    img.addEventListener('click', () => {
      navigateToProduct(product, productState);
    });
    
    // Add keyboard accessibility
    img.tabIndex = 0;
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToProduct(product, productState);
      }
    });
    
    container.innerHTML = '';
    container.appendChild(img);
    
    // Store current image
    productState.currentImage = currentImage;
  }
}

function findMainProductImage(product) {
  return product.images.find(img => 
    img.roles?.includes('thumbnail') || img.roles?.includes('image')
  ) || product.images[0];
}

function findImageByColor(product, colorValue) {
  if (!colorValue || !product.images) return null;
  
  // Try to find image with matching color in roles or label
  const colorLower = colorValue.toLowerCase();
  return product.images.find(img => {
    const label = (img.label || '').toLowerCase();
    const roles = (img.roles || []).join(' ').toLowerCase();
    return label.includes(colorLower) || roles.includes(colorLower);
  });
}

function renderProductTitle(element, product) {
  element.textContent = product.name;
  element.classList.remove('loading-placeholder');
  
  // Add click handler to title
  element.addEventListener('click', () => {
    navigateToProduct(product);
  });
  
  // Add keyboard accessibility
  element.tabIndex = 0;
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToProduct(product);
    }
  });
}

function renderProductSku(element, product, productState) {
  const displaySku = productState.currentVariant?.sku || product.sku;
  element.textContent = `SKU: ${displaySku}`;
  element.classList.remove('loading-placeholder');
}

function renderProductPrice(element, product, productState) {
  element.classList.remove('loading-placeholder');

  // For complex products, show price range initially
  if (product.priceRange) {
    const { minimum, maximum } = product.priceRange;
    
    let priceHTML = '';
    
    if (minimum && maximum) {
      const minPrice = formatPrice(minimum.final);
      const maxPrice = formatPrice(maximum.final);
      
      if (minPrice === maxPrice) {
        priceHTML = minPrice;
      } else {
        priceHTML = `<span class="product-configurator__price--range">${minPrice} - ${maxPrice}</span>`;
      }
    }
    
    element.innerHTML = priceHTML;
  } else if (product.prices?.final) {
    // Fallback to simple product pricing
    const finalPrice = product.prices.final;
    const regularPrice = product.prices.regular;
    
    let priceHTML = formatPrice(finalPrice);
    
    if (regularPrice && regularPrice.amount.value !== finalPrice.amount.value) {
      priceHTML = `<span class="product-configurator__price--sale">${priceHTML}</span> <span class="product-configurator__price--regular">${formatPrice(regularPrice)}</span>`;
    }
    
    element.innerHTML = priceHTML;
  } else {
    element.remove();
  }
}

function renderShortDescription(element, product) {
  if (product.shortDescription) {
    element.innerHTML = product.shortDescription;
  } else {
    element.remove();
  }
  element.classList.remove('loading-placeholder');
}

function renderProductOptions(container, product, productState, block) {
  container.innerHTML = '';
  
  if (!product.options || product.options.length === 0) {
    return;
  }

  product.options.forEach(option => {
    const optionGroup = document.createElement('div');
    optionGroup.className = 'product-configurator__option-group';
    optionGroup.dataset.optionId = option.id;
    
    const label = document.createElement('div');
    label.className = 'product-configurator__option-label';
    label.textContent = option.title;
    optionGroup.appendChild(label);
    
    const valuesContainer = document.createElement('div');
    valuesContainer.className = 'product-configurator__option-values';
    
    option.values.forEach(value => {
      if (value.__typename === 'ProductViewOptionValueSwatch') {
        renderColorSwatch(valuesContainer, option, value, productState, block);
      } else {
        renderOptionValue(valuesContainer, option, value, productState, block);
      }
    });
    
    optionGroup.appendChild(valuesContainer);
    container.appendChild(optionGroup);
  });
}

function renderColorSwatch(container, option, value, productState, block) {
  const swatch = document.createElement('div');
  swatch.className = 'product-configurator__color-swatch';
  swatch.dataset.optionId = option.id;
  swatch.dataset.valueId = value.id;
  swatch.title = value.title;
  
  // Apply color styling
  if (value.value) {
    // Handle different color value formats
    if (value.value.startsWith('#') || value.value.startsWith('rgb')) {
      swatch.style.backgroundColor = value.value;
    } else {
      // Try to use the value as a CSS color name or add as class
      swatch.style.backgroundColor = value.value;
      swatch.classList.add(`color-${value.value.toLowerCase().replace(/\s+/g, '-')}`);
    }
  }
  
  // Handle stock status
  if (!value.inStock) {
    swatch.classList.add('product-configurator__color-swatch--out-of-stock');
    swatch.title += ' (Out of Stock)';
  }
  
  // Handle selection
  const isSelected = productState.selectedOptions.get(option.id) === value.id;
  if (isSelected) {
    swatch.classList.add('product-configurator__color-swatch--selected');
  }
  
  // Add click handler
  swatch.addEventListener('click', () => {
    if (!value.inStock) return;
    selectOptionValue(option, value, productState, block);
  });
  
  // Add keyboard accessibility
  swatch.tabIndex = 0;
  swatch.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && value.inStock) {
      e.preventDefault();
      selectOptionValue(option, value, productState, block);
    }
  });
  
  container.appendChild(swatch);
}

function renderOptionValue(container, option, value, productState, block) {
  const optionElement = document.createElement('div');
  optionElement.className = 'product-configurator__option-value';
  optionElement.dataset.optionId = option.id;
  optionElement.dataset.valueId = value.id;
  optionElement.textContent = value.title;
  
  // Handle stock status
  if (!value.inStock) {
    optionElement.classList.add('product-configurator__option-value--out-of-stock');
  }
  
  // Handle selection
  const isSelected = productState.selectedOptions.get(option.id) === value.id;
  if (isSelected) {
    optionElement.classList.add('product-configurator__option-value--selected');
  }
  
  // Add click handler
  optionElement.addEventListener('click', () => {
    if (!value.inStock) return;
    selectOptionValue(option, value, productState, block);
  });
  
  // Add keyboard accessibility
  optionElement.tabIndex = 0;
  optionElement.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && value.inStock) {
      e.preventDefault();
      selectOptionValue(option, value, productState, block);
    }
  });
  
  container.appendChild(optionElement);
}

async function selectOptionValue(option, value, productState, block) {
  // Update selected options
  productState.selectedOptions.set(option.id, value.id);
  
  // Update visual selection state
  updateSelectionUI(block, option.id, value.id);
  
  // Handle color change for image switching
  if (value.__typename === 'ProductViewOptionValueSwatch' && value.type === 'COLOR') {
    await updateProductImage(block, productState, value);
  }
  
  // Update SKU and other dynamic content
  updateProductContent(block, productState);
  
  // Emit event for analytics
  events.emit('product-configurator/option-selected', {
    productSku: productState.product.sku,
    optionId: option.id,
    optionTitle: option.title,
    valueId: value.id,
    valueTitle: value.title,
    selectedOptions: Object.fromEntries(productState.selectedOptions)
  });
}

function updateSelectionUI(block, optionId, valueId) {
  // Remove previous selections for this option
  const optionGroup = block.querySelector(`[data-option-id="${optionId}"]`);
  if (!optionGroup) return;
  
  const allValues = optionGroup.querySelectorAll('[data-value-id]');
  allValues.forEach(el => {
    el.classList.remove('product-configurator__color-swatch--selected');
    el.classList.remove('product-configurator__option-value--selected');
  });
  
  // Add selection to current value
  const selectedValue = optionGroup.querySelector(`[data-value-id="${valueId}"]`);
  if (selectedValue) {
    if (selectedValue.classList.contains('product-configurator__color-swatch')) {
      selectedValue.classList.add('product-configurator__color-swatch--selected');
    } else {
      selectedValue.classList.add('product-configurator__option-value--selected');
    }
  }
}

async function updateProductImage(block, productState, colorValue) {
  const imageContainer = block.querySelector('.product-configurator__image');
  
  // Add loading state
  imageContainer.classList.add('product-configurator__image--loading');
  
  // Find image for selected color
  const colorImage = findImageByColor(productState.product, colorValue.value || colorValue.title);
  
  if (colorImage) {
    // Update the image
    productState.currentImage = colorImage;
    await renderProductImage(imageContainer, productState.product, productState);
  }
  
  // Remove loading state
  setTimeout(() => {
    imageContainer.classList.remove('product-configurator__image--loading');
  }, 300);
}

function updateProductContent(block, productState) {
  // Update SKU display
  const skuElement = block.querySelector('.product-configurator__sku');
  if (skuElement) {
    renderProductSku(skuElement, productState.product, productState);
  }
  
  // Update stock status if needed
  const stockElement = block.querySelector('.product-configurator__stock-status');
  if (stockElement) {
    renderStockStatus(stockElement, productState.product, productState);
  }
}

function renderStockStatus(element, product, productState) {
  // For complex products, stock status depends on selected variant
  const inStock = product.inStock; // This might need refinement based on selected options
  
  element.className = 'product-configurator__stock-status';
  
  if (inStock) {
    element.classList.add('product-configurator__stock-status--in-stock');
    element.textContent = 'In Stock';
  } else {
    element.classList.add('product-configurator__stock-status--out-of-stock');
    element.textContent = 'Out of Stock';
  }
}

async function renderProductActions(container, product, productState, config, labels) {
  const { showaddtocart, showwishlist } = config;
  
  // Clear existing content
  container.innerHTML = '';
  
  // Add to Cart Button
  if (showaddtocart && product.addToCartAllowed && product.inStock) {
    const addToCartContainer = document.createElement('div');
    addToCartContainer.className = 'product-configurator__add-to-cart';
    container.appendChild(addToCartContainer);
    
    const addToCartBtn = await UI.render(Button, {
      children: labels.Global?.AddProductToCart || 'Add to Cart',
      icon: h(Icon, { source: 'Cart' }),
      variant: 'primary',
      size: 'small',
      onClick: async () => {
        await handleAddToCart(addToCartBtn, product, productState, labels);
      }
    })(addToCartContainer);
  }
  
  // Wishlist Toggle
  if (showwishlist) {
    const wishlistContainer = document.createElement('div');
    wishlistContainer.className = 'product-configurator__wishlist';
    container.appendChild(wishlistContainer);
    
    await wishlistRender.render(WishlistToggle, {
      product: {
        sku: productState.currentVariant?.sku || product.sku,
        name: product.name,
        image: productState.currentImage?.url || product.images?.[0]?.url,
        price: product.priceRange?.minimum?.final || product.prices?.final,
        optionUIDs: Array.from(productState.selectedOptions.values())
      }
    })(wishlistContainer);
  }
}

async function handleAddToCart(button, product, productState, labels) {
  try {
    // Check if required options are selected
    const requiredOptions = product.options.filter(opt => opt.required);
    const hasAllRequiredOptions = requiredOptions.every(opt => 
      productState.selectedOptions.has(opt.id)
    );
    
    if (!hasAllRequiredOptions) {
      // Show error message
      button.setProps(prev => ({
        ...prev,
        children: 'Select all options',
        variant: 'error'
      }));
      
      setTimeout(() => {
        button.setProps(prev => ({
          ...prev,
          children: labels.Global?.AddProductToCart || 'Add to Cart',
          variant: 'primary'
        }));
      }, 2000);
      return;
    }

    // Update button state
    button.setProps(prev => ({
      ...prev,
      children: labels.Global?.AddingToCart || 'Adding...',
      disabled: true
    }));

    // Add product to cart with selected options
    const { addProductsToCart } = await import(
      '@dropins/storefront-cart/api.js'
    );
    
    const selectedOptionsArray = Array.from(productState.selectedOptions.entries()).map(
      ([optionId, valueId]) => ({ uid: valueId })
    );
    
    await addProductsToCart([{
      sku: product.sku,
      quantity: 1,
      selected_options: selectedOptionsArray
    }]);

    // Show success state briefly
    button.setProps(prev => ({
      ...prev,
      children: labels.Global?.AddedToCart || 'Added!',
      variant: 'success'
    }));

    // Reset button after 2 seconds
    setTimeout(() => {
      button.setProps(prev => ({
        ...prev,
        children: labels.Global?.AddProductToCart || 'Add to Cart',
        variant: 'primary',
        disabled: false
      }));
    }, 2000);

    // Emit event for analytics
    events.emit('cart/add', {
      sku: product.sku,
      name: product.name,
      quantity: 1,
      selectedOptions: Object.fromEntries(productState.selectedOptions)
    });

  } catch (error) {
    console.error('Error adding to cart:', error);
    
    // Show error state
    button.setProps(prev => ({
      ...prev,
      children: 'Error',
      variant: 'error',
      disabled: true
    }));
    
    // Reset button after 3 seconds
    setTimeout(() => {
      button.setProps(prev => ({
        ...prev,
        children: labels.Global?.AddProductToCart || 'Add to Cart',
        variant: 'primary',
        disabled: false
      }));
    }, 3000);
  }
}

function navigateToProduct(product, productState = null) {
  let productUrl = product.url || rootLink(`/products/${product.urlKey}/${product.sku}`);
  
  // Add selected options as query parameters if available
  if (productState?.selectedOptions.size > 0) {
    const params = new URLSearchParams();
    productState.selectedOptions.forEach((valueId, optionId) => {
      params.append(`option_${optionId}`, valueId);
    });
    productUrl += `?${params.toString()}`;
  }
  
  window.location.href = productUrl;
  
  // Emit event for analytics
  events.emit('product/view', {
    sku: product.sku,
    name: product.name,
    source: 'product-configurator',
    selectedOptions: productState ? Object.fromEntries(productState.selectedOptions) : null
  });
}

function formatPrice(price) {
  if (!price || !price.amount) return '';
  
  const { value, currency } = price.amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD'
  }).format(value);
}

function renderError(block, message) {
  block.classList.remove('product-configurator--loading');
  block.classList.add('product-configurator--error');
  block.innerHTML = `
    <div class="product-configurator__error">
      <p>${message}</p>
    </div>
  `;
}

function readBlockConfig(block) {
  const config = {};
  const rows = block.querySelectorAll(':scope > div');
  
  rows.forEach((row) => {
    const cols = row.querySelectorAll(':scope > div');
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase();
      const value = cols[1].textContent.trim();
      
      // Convert boolean strings
      if (value === 'true') config[key] = true;
      else if (value === 'false') config[key] = false;
      else config[key] = value;
    }
  });
  
  return config;
}
