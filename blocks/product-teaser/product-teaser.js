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
    showwishlist = false
  } = config;

  if (!sku) {
    renderError(block, 'Product SKU is required');
    return;
  }

  // Get labels for internationalization
  const labels = await fetchPlaceholders();

  // Add loading state and layout class
  block.classList.add('product-teaser--loading');
  block.classList.add(`product-teaser--${layout}`);

  // Create basic structure
  block.innerHTML = `
    <div class="product-teaser__image">
      <div class="loading-placeholder"></div>
    </div>
    <div class="product-teaser__content">
      <div class="product-teaser__title loading-placeholder"></div>
      <div class="product-teaser__sku loading-placeholder"></div>
      ${showprice ? '<div class="product-teaser__price loading-placeholder"></div>' : ''}
      <div class="product-teaser__short-description loading-placeholder"></div>
      ${(showaddtocart || showwishlist) ? '<div class="product-teaser__actions"></div>' : ''}
    </div>
  `;

  try {
    // Fetch product data
    const product = await pdpApi.fetchProductData(sku);
    
    if (!product) {
      throw new Error(`Product with SKU ${sku} not found`);
    }

    // Remove loading state
    block.classList.remove('product-teaser--loading');

    // Render product content
    await renderProductTeaser(block, product, config, labels);

  } catch (error) {
    console.error('Error loading product teaser:', error);
    renderError(block, `Error loading product: ${error.message}`);
  }
}

async function renderProductTeaser(block, product, config, labels) {
  const { showprice, showaddtocart, showwishlist, layout } = config;
  
  // Get DOM elements
  const imageContainer = block.querySelector('.product-teaser__image');
  const titleElement = block.querySelector('.product-teaser__title');
  const skuElement = block.querySelector('.product-teaser__sku');
  const priceElement = block.querySelector('.product-teaser__price');
  const shortDescElement = block.querySelector('.product-teaser__short-description');
  const actionsContainer = block.querySelector('.product-teaser__actions');

  // Render product image
  await renderProductImage(imageContainer, product);

  // Render product title
  renderProductTitle(titleElement, product);
  
  // Render product SKU
  renderProductSku(skuElement, product);

  // Render price
  if (showprice && priceElement) {
    renderProductPrice(priceElement, product);
  } else if (priceElement) {
    priceElement.remove();
  }

  // Render short description
  renderShortDescription(shortDescElement, product);

  // Render stock status
  renderStockStatus(block, product);

  // Render actions (Add to Cart and Wishlist)
  if (actionsContainer && (showaddtocart || showwishlist)) {
    await renderProductActions(actionsContainer, product, config, labels);
  }
}

async function renderProductImage(container, product) {
  if (!product.images || product.images.length === 0) {
    container.innerHTML = '<div class="product-teaser__no-image">No Image</div>';
    return;
  }

  const mainImage = product.images.find(img => 
    img.roles?.includes('thumbnail') || img.roles?.includes('image')
  ) || product.images[0];

  if (mainImage) {
    const img = document.createElement('img');
    img.src = mainImage.url;
    img.alt = product.name;
    img.loading = 'lazy';
    img.width = mainImage.width || 400;
    img.height = mainImage.height || 400;
    
    // Add click handler to navigate to PDP
    img.addEventListener('click', () => {
      navigateToProduct(product);
    });
    
    // Add keyboard accessibility
    img.tabIndex = 0;
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToProduct(product);
      }
    });
    
    container.innerHTML = '';
    container.appendChild(img);
  }
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

function renderProductSku(element, product) {
  element.textContent = `SKU: ${product.sku}`;
  element.classList.remove('loading-placeholder');
}

function renderProductPrice(element, product) {
  if (!product.prices || !product.prices.final) {
    element.remove();
    return;
  }

  const finalPrice = product.prices.final;
  const regularPrice = product.prices.regular;
  
  let priceHTML = '';
  
  if (finalPrice.amount) {
    priceHTML = formatPrice(finalPrice);
    
    // Show strikethrough for regular price if different from final price
    if (regularPrice.amount && regularPrice.amount.value !== finalPrice.amount.value) {
      priceHTML = `<span class="product-teaser__price--sale">${priceHTML}</span> <span class="product-teaser__price--regular">${formatPrice(regularPrice)}</span>`;
    }
  }
  
  element.innerHTML = priceHTML;
  element.classList.remove('loading-placeholder');
}

function renderShortDescription(element, product) {
  if (product.shortDescription) {
    element.innerHTML = product.shortDescription;
  } else {
    element.remove();
  }
  element.classList.remove('loading-placeholder');
}

function renderStockStatus(block, product) {
  const stockStatusElement = document.createElement('div');
  stockStatusElement.className = 'product-teaser__stock-status';
  
  if (product.inStock) {
    stockStatusElement.classList.add('product-teaser__stock-status--in-stock');
    stockStatusElement.textContent = 'In Stock';
  } else {
    stockStatusElement.classList.add('product-teaser__stock-status--out-of-stock');
    stockStatusElement.textContent = 'Out of Stock';
  }
  
  const contentElement = block.querySelector('.product-teaser__content');
  const actionsElement = block.querySelector('.product-teaser__actions');
  
  if (actionsElement) {
    contentElement.insertBefore(stockStatusElement, actionsElement);
  } else {
    contentElement.appendChild(stockStatusElement);
  }
}

async function renderProductActions(container, product, config, labels) {
  const { showaddtocart, showwishlist } = config;
  
  // Clear existing content
  container.innerHTML = '';
  
  // Add to Cart Button
  if (showaddtocart && product.addToCartAllowed && product.inStock) {
    const addToCartContainer = document.createElement('div');
    addToCartContainer.className = 'product-teaser__add-to-cart';
    container.appendChild(addToCartContainer);
    
    const addToCartBtn = await UI.render(Button, {
      children: labels.Global?.AddProductToCart || 'Add to Cart',
      icon: h(Icon, { source: 'Cart' }),
      variant: 'primary',
      size: 'small',
      onClick: async () => {
        await handleAddToCart(addToCartBtn, product, labels);
      }
    })(addToCartContainer);
  }
  
  // Wishlist Toggle
  if (showwishlist) {
    const wishlistContainer = document.createElement('div');
    wishlistContainer.className = 'product-teaser__wishlist';
    container.appendChild(wishlistContainer);
    
    await wishlistRender.render(WishlistToggle, {
      product: {
        sku: product.sku,
        name: product.name,
        image: product.images?.[0]?.url,
        price: product.prices?.final,
        optionUIDs: product.optionUIDs
      }
    })(wishlistContainer);
  }
}

async function handleAddToCart(button, product, labels) {
  try {
    // Update button state
    button.setProps(prev => ({
      ...prev,
      children: labels.Global?.AddingToCart || 'Adding...',
      disabled: true
    }));

    // Add product to cart
    const { addProductsToCart } = await import(
      '@dropins/storefront-cart/api.js'
    );
    
    await addProductsToCart([{
      sku: product.sku,
      quantity: 1
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
      quantity: 1
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

function navigateToProduct(product) {
  const productUrl = product.url || rootLink(`/products/${product.urlKey}/${product.sku}`);
  window.location.href = productUrl;
  
  // Emit event for analytics
  events.emit('product/view', {
    sku: product.sku,
    name: product.name,
    source: 'product-teaser'
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
  block.classList.remove('product-teaser--loading');
  block.classList.add('product-teaser--error');
  block.innerHTML = `
    <div class="product-teaser__error">
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
