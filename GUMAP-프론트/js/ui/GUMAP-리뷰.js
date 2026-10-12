// ============================================================
// 📁 파일명: js/ui/reviews.js
// 📌 역할: 장소별 사용자 리뷰 및 별점 평가 시스템
// ============================================================
//
// [파일 설명]
//   장소를 클릭했을 때 표시되는 팝업에 별점(1~5점)과 한줄평을
//   남기고 조회할 수 있는 사용자 리뷰 시스템입니다.
//   - saveReview(): 별점과 코멘트를 localStorage에 저장
//   - getAverageRating(): 평균 별점 및 리뷰 수 계산
//     (리뷰가 없으면 0건 - 평점을 지어내지 않는다)
//   - renderStars(): 별점을 ★ 아이콘 HTML로 변환
//   - openReviewModal(): 별점 입력 모달 팝업 표시
//
// [의존 관계]
//   - map-click.js → 팝업 내부에서 openReviewModal() 호출
//   - map-click.js → window.selectedLocation (장소 클릭 시 주입되는 전역 상태)
//
// [데이터 저장소]
//   - localStorage key: 'gumap_review_' + 장소명 (장소별 개별 키)
// ============================================================

window.getReviewKey = function(title) {
    return 'gumap_review_' + title.replace(/[^\w\sㄱ-힣가-힣]/g, '').trim();
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
    reviews.push({
        rating: rating,
        comment: comment,
        date: new Date().toISOString().split('T')[0]
    });
    localStorage.setItem(key, JSON.stringify(reviews));
};

window.getAverageRating = function(title) {
    var reviews = window.getReviews(title);
    if (reviews.length > 0) {
        var sum = reviews.reduce(function(acc, r) { return acc + r.rating; }, 0);
        return { avg: (sum / reviews.length).toFixed(1), count: reviews.length, hasReal: true };
    }
    // 평점이 없으면 없다고 보여 준다. 예전에는 장소 이름 해시로 3.0~4.9점·1~12건을
    // 지어내 보여 줬고, '맛집' 검색 순위까지 그 가짜 평점으로 매겼다.
    return { avg: "0.0", count: 0, hasReal: false };
};

// 팝업에 넣을 평점 요약. 리뷰는 이 브라우저(localStorage)에만 저장되므로 "내 평점"이다.
window.renderRatingSummary = function(title) {
    var info = window.getAverageRating(title);
    if (!info.count) {
        return '<span style="color:var(--text-muted); font-size:11px;">아직 남긴 평점이 없습니다</span>';
    }
    return window.renderStars(parseFloat(info.avg)) +
        ` <b style="color:#f59e0b; font-size:13px;">${info.avg}</b>` +
        ` <span style="color:var(--text-muted); font-size:11px;">(내 평점 ${info.count}건 · 이 기기에만 저장)</span>`;
};

window.renderStars = function(rating) {
    var html = '';
    var fullStars = Math.floor(rating);
    var hasHalf = (rating - fullStars) >= 0.5;
    for (var i = 0; i < 5; i++) {
        if (i < fullStars) {
            html += '<span style="color:#f59e0b;">★</span>';
        } else if (i === fullStars && hasHalf) {
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
    document.getElementById('review-modal-title').innerText = title.replace(/[^\w\sㄱ-힣가-힣&.·,() ]/g, '').trim();
    document.getElementById('review-place-lat').value = lat;
    document.getElementById('review-place-lng').value = lng;
    document.getElementById('review-place-name').value = title;
    document.getElementById('review-stars-input').value = '5';
    document.getElementById('review-comment-input').value = '';
    // 별점 UI 초기화
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
    var title = document.getElementById('review-place-name').value;
    var rating = parseInt(document.getElementById('review-stars-input').value);
    var comment = document.getElementById('review-comment-input').value.trim();
    if (!rating || rating < 1 || rating > 5) {
        alert("별점을 선택해주세요 (1~5점)");
        return;
    }
    window.saveReview(title, rating, comment);
    document.getElementById('review-modal').style.display = 'none';
    
    // 팝업이 열려있으면 평점 즉시 갱신
    if (window.selectedLocation) {
        var ratingEl = document.getElementById('popup-rating-area');
        if (ratingEl) ratingEl.innerHTML = window.renderRatingSummary(title);
    }
    alert("⭐ 평점이 등록되었습니다! 감사합니다.");
};
