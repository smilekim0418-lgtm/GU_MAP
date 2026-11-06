// ============================================================
// 📁 파일명: js/ui/GUMAP-리뷰.js
// 📌 역할: 장소별 사용자 리뷰 및 별점 평가 시스템 (경량 로컬 버전)
// ============================================================

window.getReviewKey = function(title) {
    var safeTitle = String(title || '장소').replace(/[^\w\sㄱ-힣가-힣]/g, '').trim();
    return 'gumap_review_' + (safeTitle || 'default');
};

window.getReviews = function(title) {
    var key = window.getReviewKey(title);
    try {
        var data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch(e) {
        return [];
    }
};

window.saveReview = function(title, rating, comment) {
    var key = window.getReviewKey(title);
    var reviews = window.getReviews(title);
    var safeComment = String(comment || '').replace(/[<>]/g, '').trim();
    reviews.push({
        rating: Number(rating) || 5,
        comment: safeComment,
        date: new Date().toISOString().split('T')[0]
    });
    try {
        localStorage.setItem(key, JSON.stringify(reviews));
    } catch(e) {}
};

window.getAverageRating = function(title) {
    var reviews = window.getReviews(title);
    if (reviews.length > 0) {
        var sum = reviews.reduce(function(acc, r) { return acc + (Number(r.rating) || 5); }, 0);
        return { avg: (sum / reviews.length).toFixed(1), count: reviews.length, hasReal: true };
    }
    // 사용자 리뷰가 없는 경우 장소명 해시 기반으로 일관된 초기 평점 생성
    var hash = 0;
    var cleanTitle = String(title || '장소').replace(/[^\w\sㄱ-힣가-힣]/g, '').trim();
    for (var i = 0; i < cleanTitle.length; i++) {
        hash = ((hash << 5) - hash) + cleanTitle.charCodeAt(i);
        hash |= 0;
    }
    var pseudoAvg = 3.5 + (Math.abs(hash % 15) / 10); // 3.5 ~ 4.9
    var pseudoCount = 1 + Math.abs(hash % 12); // 1 ~ 12
    return { avg: pseudoAvg.toFixed(1), count: pseudoCount, hasReal: false };
};

window.renderStars = function(rating) {
    var numRating = parseFloat(rating) || 0;
    var html = '';
    var fullStars = Math.floor(numRating);
    var hasHalf = (numRating - fullStars) >= 0.5;
    for (var i = 0; i < 5; i++) {
        if (i < fullStars || (i === fullStars && hasHalf)) {
            html += '<span style="color:#f59e0b;">★</span>';
        } else {
            html += '<span style="color:#d1d5db;">★</span>';
        }
    }
    return html;
};

// 하위 호환성을 위한 글로벌 스코프 바인딩
var getReviewKey = window.getReviewKey;
var getReviews = window.getReviews;
var saveReview = window.saveReview;
var getAverageRating = window.getAverageRating;
var renderStars = window.renderStars;

// 평점남기기 모달 열기
window.openReviewModal = function(title, lat, lng) {
    var modal = document.getElementById('review-modal');
    if (!modal) return;
    var cleanTitle = String(title || '장소').replace(/[^\w\sㄱ-힣가-힣&.·,() ]/g, '').trim();
    var titleEl = document.getElementById('review-modal-title');
    if (titleEl) titleEl.innerText = cleanTitle;
    var latEl = document.getElementById('review-place-lat');
    if (latEl) latEl.value = lat || 0;
    var lngEl = document.getElementById('review-place-lng');
    if (lngEl) lngEl.value = lng || 0;
    var nameEl = document.getElementById('review-place-name');
    if (nameEl) nameEl.value = cleanTitle;
    var starsEl = document.getElementById('review-stars-input');
    if (starsEl) starsEl.value = '5';
    var commentEl = document.getElementById('review-comment-input');
    if (commentEl) commentEl.value = '';
    window.setReviewStars(5);
    modal.style.display = 'flex';
};

window.setReviewStars = function(n) {
    var starsInput = document.getElementById('review-stars-input');
    if (starsInput) starsInput.value = n;
    for (var i = 1; i <= 5; i++) {
        var starEl = document.getElementById('review-star-' + i);
        if (starEl) {
            starEl.style.color = i <= n ? '#f59e0b' : '#d1d5db';
        }
    }
};

window.submitReview = function() {
    var nameEl = document.getElementById('review-place-name');
    var starsEl = document.getElementById('review-stars-input');
    var commentEl = document.getElementById('review-comment-input');
    var title = nameEl ? nameEl.value : '장소';
    var rating = starsEl ? parseInt(starsEl.value, 10) : 5;
    var comment = commentEl ? commentEl.value.trim() : '';
    if (!rating || rating < 1 || rating > 5) {
        alert("별점을 선택해주세요 (1~5점)");
        return;
    }
    window.saveReview(title, rating, comment);
    var modal = document.getElementById('review-modal');
    if (modal) modal.style.display = 'none';

    var ratingInfo = window.getAverageRating(title);
    var updatedHtml = window.renderStars(parseFloat(ratingInfo.avg)) +
        ' <b style="color:#f59e0b; font-size:13px;">' + ratingInfo.avg + '</b>' +
        ' <span style="color:#94a3b8; font-size:11px;">(' + ratingInfo.count + '건)</span>';

    // 팝업 또는 WebGL 건물 사이드바 평점 영역 즉시 갱신
    ['popup-rating-area', 'sidebar-rating-area'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = updatedHtml;
    });

    if (typeof window.showToast === 'function') {
        window.showToast("⭐ 평점이 등록되었습니다! 감사합니다.");
    } else {
        alert("⭐ 평점이 등록되었습니다! 감사합니다.");
    }
};
