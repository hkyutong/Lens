let parentUrl = (function () {
            let url = '';
            if (parent !== window) {
                try {
                    return parent.location.href;
                } catch (e) {
                    return document.referrer;
                }
            }
            return url;
        })()
        
        if (!parentUrl.startsWith('https://edu.yutogpt.com')) reset()

        let verificationPassed = false
        window.addEventListener('message', (e) => {
            if (e.data === 'verificationPassed') verificationPassed = true
        })
        setTimeout(() => !verificationPassed && reset(), 100);

        parentUrl && window.top.postMessage('verifyUrl', parentUrl)
        console.log(parentUrl)

        function reset() {
            document.write('')
            window.close()
        }