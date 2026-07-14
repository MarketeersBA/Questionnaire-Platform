import pytest
import numpy as np
from umap import UMAP
from hdbscan import HDBSCAN
from sklearn.metrics import pairwise_distances

def generate_mock_embeddings(n_samples=20, cluster_offset=5.0):
    """
    Generates two distinct groups of 1536-dim embeddings.
    Group A: 'Happy' (centered around 0.1)
    Group B: 'Angry' (centered around 0.1 + offset)
    """
    # Group A: Positive
    group_a = np.random.normal(0.1, 0.01, (n_samples, 1536))
    # Group B: Negative
    group_b = np.random.normal(0.1 + cluster_offset, 0.01, (n_samples, 1536))
    
    X = np.vstack([group_a, group_b])
    y = np.array([0] * n_samples + [1] * n_samples) # Labels for verification
    return X, y

def test_umap_geometric_separation():
    """
    Verifies that UMAP correctly maps semantically different embeddings 
    into significantly distant points in the reduced 2D/5D space.
    """
    X, y = generate_mock_embeddings(n_samples=30, cluster_offset=2.0)
    
    # Run UMAP (Reduce to 5D as per our cluster engine config)
    reducer = UMAP(n_components=5, random_state=42)
    embedding_reduced = reducer.fit_transform(X)
    
    # Calculate Centroids in reduced space
    centroid_a = np.mean(embedding_reduced[:30], axis=0)
    centroid_b = np.mean(embedding_reduced[30:], axis=0)
    
    # Euclidean distance between Happy and Angry centroids
    dist = np.linalg.norm(centroid_a - centroid_b)
    
    # Verify separation (In UMAP space, 30 samples offset by 2.0 should be clearly distant)
    assert dist > 1.0, f"Geometric separation too low ({dist:.2f}). Embeddings are bleeding together."

def test_hdbscan_reproducibility():
    """
    Ensures that HDBSCAN produces consistent cluster assignments 
    across multiple runs on the same dataset.
    """
    X, _ = generate_mock_embeddings(n_samples=25, cluster_offset=10.0)
    
    # Run 1
    clusterer_1 = HDBSCAN(min_cluster_size=5, core_dist_n_jobs=-1)
    labels_1 = clusterer_1.fit_predict(X)
    
    # Run 2
    clusterer_2 = HDBSCAN(min_cluster_size=5, core_dist_n_jobs=-1)
    labels_2 = clusterer_2.fit_predict(X)
    
    # In a stable density-based clustering, labels should be identical for clear clusters
    # Note: Label IDs might swap, but the membership structure must remain the same.
    # We use Adjusted Rand Index (ARI) for cluster similarity validation.
    from sklearn.metrics import adjusted_rand_score
    ari = adjusted_rand_score(labels_1, labels_2)
    
    assert ari > 0.95, f"Cluster drift detected! ARI score {ari:.2f} is too low."

def test_outlier_noise_handling():
    """Verifies that HDBSCAN correctly identifies random noise as outlier (-1)."""
    X_clean, _ = generate_mock_embeddings(n_samples=20, cluster_offset=10.0)
    # Add a single extreme outlier
    outlier = np.random.normal(50.0, 1.0, (1, 1536))
    X_noisy = np.vstack([X_clean, outlier])
    
    clusterer = HDBSCAN(min_cluster_size=5)
    labels = clusterer.fit_predict(X_noisy)
    
    # The last element (outlier) should be labeled -1
    assert labels[-1] == -1, "Failure to detect geometric outlier as noise."
