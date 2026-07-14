import numpy as np
import logging
from typing import List, Dict, Any, Optional
import umap
import hdbscan
from sklearn.feature_extraction.text import TfidfVectorizer
from openai import OpenAI
import json

from backend.config import settings
from backend.analytics_module.src.ai import AIGuard, api_cost
from backend.analytics_module.src.ai.utils import stream_json_completion

logger = logging.getLogger(__name__)

class ClusterEngine:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)

    async def cluster_feedback(self, feedbacks: List[Dict[str, Any]], embeddings: List[List[float]]) -> List[Dict[str, Any]]:
        """
        Runs the clustering pipeline: Dimensionality Reduction -> Density-based Clustering -> Labeling.
        """
        if len(embeddings) < 5:
            logger.warning("Too few embeddings for meaningful clustering.")
            return []

        # 1. Dimensionality Reduction (UMAP)
        # Reduced to 5D for HDBSCAN (density clusters work better in lower but not too low dim)
        reducer = umap.UMAP(
            n_neighbors=min(15, len(embeddings) - 1),
            n_components=5,
            min_dist=0.0,
            metric='cosine',
            random_state=42
        )
        reduced_embeddings = reducer.fit_transform(embeddings)

        # 2. Clustering (HDBSCAN)
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min(3, len(embeddings)),
            min_samples=1,
            metric='euclidean',
            cluster_selection_method='eom'
        )
        cluster_labels = clusterer.fit_predict(reduced_embeddings)

        # 3. Aggregate Data per Cluster
        unique_labels = np.unique(cluster_labels)
        clusters = []

        # Prepare for TF-IDF
        texts = [f.get("normalized_text", "") for f in feedbacks]
        
        for label in unique_labels:
            if label == -1: # Noise cluster in HDBSCAN
                continue
                
            indices = np.where(cluster_labels == label)[0]
            member_docs = [feedbacks[i] for i in indices]
            member_texts = [texts[i] for i in indices]
            
            # Extract basic metrics
            sentiments = [f.get("nlp_result", {}).get("sentiment", "neutral") for f in member_docs]
            sentiment_dist = {
                "positive": sentiments.count("positive"),
                "negative": sentiments.count("negative"),
                "neutral": sentiments.count("neutral")
            }
            
            # Extract Keywords (TF-IDF)
            top_keywords = self._extract_keywords(member_texts)
            
            # Generate Label via LLM
            cluster_label_name = await self._generate_cluster_label(member_texts, top_keywords)
            
            clusters.append({
                "cluster_internal_id": int(label),
                "label": cluster_label_name,
                "size": len(indices),
                "percentage": round((len(indices) / len(feedbacks)) * 100, 1),
                "sentiment_distribution": sentiment_dist,
                "top_keywords": top_keywords,
                "representative_quotes": member_texts[:3], # Simplification: first 3
                "indices": indices.tolist()
            })

        return sorted(clusters, key=lambda x: x["size"], reverse=True)

    def _extract_keywords(self, texts: List[str], top_n: int = 5) -> List[str]:
        if not texts: return []
        try:
            # Use simple TF-IDF
            vectorizer = TfidfVectorizer(stop_words=None, max_features=20) # We handle Arabic stop words via our normalizer's noise filter
            tfidf_matrix = vectorizer.fit_transform(texts)
            scores = np.asarray(tfidf_matrix.sum(axis=0)).ravel()
            features = vectorizer.get_feature_names_out()
            top_indices = scores.argsort()[::-1][:top_n]
            return [features[i] for i in top_indices]
        except:
            return []

    async def _generate_cluster_label(self, texts: List[str], keywords: List[str]) -> str:
        """Use GPT-4o to generate a concise, descriptive title for the cluster."""
        sample_text = "\n- ".join(texts[:10]) # Use up to 10 samples
        prompt = f"""
        Given the following customer feedback excerpts and top keywords, generate a short, professional, and descriptive title (5 words max) that summarizes the core theme of this group.
        
        Keywords: {', '.join(keywords)}
        Excerpts:
        - {sample_text}
        
        Output only the title.
        """
        
        async def _call_api():
            response = await stream_json_completion(
                client=self.client,
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=20,
                temperature=0.3
            )
            return response.choices[0].message.content.strip().strip('"')

        try:
            label = await AIGuard.wrap_call_async(
                slide_id="cluster_labeling",
                func=_call_api
            )
            return label or "General Feedback"
        except:
            return "General Feedback"

# Global instance
cluster_engine = ClusterEngine()
