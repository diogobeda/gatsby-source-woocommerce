const { createRemoteFileNode } = require(`gatsby-source-filesystem`)

const processNode = (createNodeId, createContentDigest, node) => {
  const { fieldName } = node
  delete node.fieldName
  const nodeContent = JSON.stringify(node)

  const nodeData = Object.assign({}, node, {
    id: createNodeId(`woocommerce-${fieldName}-${node.id}`),
    wordpress_id: node["id"],
    parent: null,
    children: [],
    internal: {
      type: `wc${capitalize(fieldName)}`,
      content: nodeContent,
      contentDigest: createContentDigest(nodeContent),
    },
  })

  return nodeData
}

// Create links between products and categories (bi-directional)
const mapProductsToCategories = nodes => {
  const categories = nodes.filter(
    node => node.internal.type === "wcProductsCategories"
  )

  return nodes.map(node => {
    if (categories.length && node.internal.type === "wcProducts") {
      node.categories.forEach(({ id }) => {
        const category = categories.find(c => id === c.wordpress_id)
        if (category) {
          if (!node.categories_conection___NODE) {
            // Initialise the connection array if necessary
            node.categories_connection___NODE = []
          }
          // Add the current category ID to the connection array
          node.categories_connection___NODE.push(category.id)

          if (!category.products___NODE) {
            // Initialise the product connection array if necessary
            category.products___NODE = []
          }
          // Add the current product's ID to the connection array
          category.products___NODE.push(node.id)
        }
      })
    }
    return node
  })
}

// Turn multi part endpoints into camelCase
// e.g. products/categories becomes productsCategories
const normaliseFieldName = name => {
  const parts = name.split("/")
  return parts.reduce((whole, partial) => {
    if (whole === "") {
      return whole.concat(partial)
    }
    return whole.concat(partial[0].toUpperCase() + partial.slice(1))
  }, "")
}

const downloadMedia = async ({
  n,
  image,
  store,
  cache,
  touchNode,
  createNode,
  createNodeId,
}) => {
  let fileNodeID
  const mediaDataCacheKey = `wordpress-media-${image.id}`
  const cacheMediaData = await cache.get(mediaDataCacheKey)

  if (cacheMediaData && n.modified === cacheMediaData.modified) {
    fileNodeID = cacheMediaData.fileNodeID
    touchNode({ nodeId: fileNodeID })
  }

  if (!fileNodeID) {
    try {
      const fileNode = await createRemoteFileNode({
        url: image.src,
        store,
        cache,
        createNode,
        createNodeId,
        parentNodeId: n.id.toString(),
      })

      if (fileNode) {
        fileNodeID = fileNode.id

        await cache.set(mediaDataCacheKey, {
          fileNodeID,
          modified: n.modified,
        })
      }
    } catch (e) {
      // Ignore
    }
  }
  if (fileNodeID) {
    image.localFile___NODE = fileNodeID
  }
}

const mapMediaToNodes = async ({
  nodes,
  store,
  cache,
  createNode,
  createNodeId,
  touchNode,
}) => {
  return Promise.all(
    nodes.map(async n => {
      const commonParams = {
        n,
        store,
        cache,
        touchNode,
        createNode,
        createNodeId,
      }

      if (n.images && n.images.length) {
        await n.images.map(async image => {
          downloadMedia({
            image,
            ...commonParams,
          })
        })
        return n
      } else if (n.image && n.image.id) {
        const { image } = n
        await downloadMedia({
          image,
          ...commonParams,
        })

        return n
      } else {
        return n
      }
    })
  )
}

module.exports = {
  processNode,
  normaliseFieldName,
  mapMediaToNodes,
  mapProductsToCategories,
}

// Helper Helpers
function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1)
}
