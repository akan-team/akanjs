pipeline {
    agent any
    environment {
        BRANCH = "$env.BRANCH_NAME".replace("-canary", "")
        BUILD_CONF = credentials("bunkan-jenkins-conf")
        JENKINS_CREDENTIALS = credentials("bunkan-jenkins-credentials")
        KUBE_SECRET = credentials("bunkan-kube-secret")
        KUBE_CONFIG = credentials("bunkan-kube-config")
        COMMON_SECRET = credentials("bunkan-common-secret")
        SSH_KEY = credentials("bunkan-id")
        ALL_PROJECTS = "akan"
        ALL_LIBS="shared,util"
        TEST_LIBS="util,shared"
    }
    stages {
        stage("Boot"){
            steps{
                sh "cp $BUILD_CONF .jenkins.conf"
                load ".jenkins.conf"
                discordSend description: "Build Start - $env.JOB_NAME $env.BUILD_NUMBER", link: env.BUILD_URL, result: currentBuild.currentResult, title: env.JOB_NAME, webhookURL: env.DISCORD_WEBHOOK
                sh "tar --exclude=.git -cvf codebase.tar ./"
            }
        }
        stage("Prepare"){
            parallel{
                stage("Prepare Master"){
                    steps{
                        sh "ssh -o StrictHostKeyChecking=no -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"mkdir -p $REPO_NAME/$BRANCH/node_modules && touch $REPO_NAME/$BRANCH/dummy.js\""
                        sh "ssh -i $SSH_KEY -p $MASTER_PORT $MASTER_USER@$MASTER_HOST \"cd $REPO_NAME/$BRANCH && find . -maxdepth 1 ! -path . ! \\( -name node_modules -or -name bun.lock -or -name dist -or -name .git \\) -print0 | xargs -0 rm -r\""
                        sh "scp -i $SSH_KEY -P $MASTER_PORT codebase.tar $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/codebase.tar"
                        sh "ssh -i $SSH_KEY -p $MASTER_PORT $MASTER_USER@$MASTER_HOST \"cd $REPO_NAME/$BRANCH && tar -xvf codebase.tar\""
                        sh "scp -i $SSH_KEY -P $MASTER_PORT $KUBE_SECRET $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/master/regcred.yaml"
                        sh "scp -i $SSH_KEY -P $MASTER_PORT $COMMON_SECRET $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/app/values/_common-secret.yaml"
                        sh "scp -i $SSH_KEY -P $MASTER_PORT $JENKINS_CREDENTIALS $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/master/jenkins/credentials.sh"
                        script {
                            ALL_PROJECTS.tokenize(",").each { app -> 
                                sh "scp -i $SSH_KEY -P $MASTER_PORT $KUBE_CONFIG $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/master/${app}.yaml"
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-helm-secret", variable: "SECRET")]) {
                                    sh "scp -i $SSH_KEY -P $MASTER_PORT $SECRET $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/app/values/$app-secret.yaml"
                                }
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master && chmod 777 ${app}.yaml && kubectl config use-context $app --kubeconfig ${app}.yaml\""
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master && kubectl get ns $app-$BRANCH --kubeconfig ${app}.yaml || kubectl create ns $app-$BRANCH --kubeconfig ${app}.yaml\""
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master && (kubectl delete -f regcred.yaml -n $app-$BRANCH --kubeconfig ${app}.yaml || true) && kubectl apply -f regcred.yaml -n $app-$BRANCH --kubeconfig ${app}.yaml\""
                            }
                        }
                    }
                }
                stage("Prepare Build"){
                    steps{
                        sh "ssh -i $SSH_KEY -o StrictHostKeyChecking=no $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"mkdir -p $REPO_NAME/$BRANCH/node_modules && mkdir -p $REPO_NAME/$BRANCH/dist && touch $REPO_NAME/$BRANCH/dummy.js && chmod -R 777 $REPO_NAME/$BRANCH/dist \""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && find . -maxdepth 1 ! -path . ! \\( -name node_modules -or -name bun.lock -or -name dist -or -name .git \\) -print0 | xargs -0 rm -r\""
                        sh "scp -i $SSH_KEY -P $BUILD_PORT codebase.tar $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/codebase.tar"
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && tar -xvf codebase.tar\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'USE_AKANJS_PKGS=true' >> .env\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'AKAN_PUBLIC_REPO_NAME=$REPO_NAME' >> .env\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'AKAN_PUBLIC_SERVE_DOMAIN=$env.SERVE_DOMAIN' >> .env\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'AKAN_PUBLIC_ENV=$BRANCH' >> .env\""
                        sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && timeout 3m bun install\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && bun run buildAkan\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && bun run runAkan script akan generateDocsSearch\""
                        script {
                            PROJECTS = ALL_PROJECTS.tokenize(",");
                            ALL_PROJECTS.tokenize(",").each { app -> 
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-server-env-$BRANCH", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.server.ts"        
                                }
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-server-env-testing", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.server.testing.ts"        
                                }
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-client-env-$BRANCH", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.client.ts"
                                }
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-client-env-testing", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.client.testing.ts"
                                }
                            }
                            ALL_LIBS.tokenize(",").each { lib -> 
                                withCredentials([file(credentialsId: "$REPO_NAME-$lib-server-env-testing", variable: "ENV")]) {
                                    sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"mkdir -p ~/$REPO_NAME/$BRANCH/libs/$lib/env\""
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/libs/$lib/env/env.server.testing.ts"
                                }
                            }
                        }
                    }
                }
            }
        }
        stage("Build"){
            steps {
                script {
                    def builds = [:]
                    def maxConcurrentJobs = 4
                    PROJECTS.each { app -> 
                        builds["build-$app"] = {
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run runAkan build $app\""
                        }
                    }
                    def totalJobs = builds.size()
                    def totalBranches = totalJobs / maxConcurrentJobs
                    def jobNames = builds.keySet()
                    def jobPlans = builds.values()
                    for (int branch = 0; branch < totalBranches; branch++) {
                        def start = branch * maxConcurrentJobs
                        def end = ((branch + 1) * maxConcurrentJobs < totalJobs ? (branch + 1) * maxConcurrentJobs : totalJobs) - 1
                        def jobs = [:]
                        (start..end).each { index ->
                            jobs[jobNames[index]] = jobPlans[index]
                        }
                        parallel jobs
                    }
                }
            }
        }
        stage("Test"){
            steps {
                // The framework unit suites, gating Dockerize and Deploy. `testPkgs` is the same command
                // developers run locally, so a red build here reproduces with one line and no Jenkins.
                //
                // Prepare Build has already run `bun install` and written AKAN_PUBLIC_REPO_NAME /
                // AKAN_PUBLIC_SERVE_DOMAIN / AKAN_PUBLIC_ENV into `.env`, which the cli suite needs:
                // 8 of its tests build temp workspaces through `WorkspaceExecutor.getBaseDevEnv`, which
                // throws without them.
                sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run testPkgs\""
            }
        }
        // The app and lib suites (ALL_PROJECTS + TEST_LIBS) are still not run anywhere. Their testing
        // credentials are already fetched in Prepare Build, so the missing piece is only a command —
        // but they have never been green in CI, so enabling them belongs in its own change rather than
        // silently blocking every deploy.
        stage("Dockerize"){
            steps {
                script {
                    def dockerizes = [:]
                    def maxConcurrentJobs = 6
                    PROJECTS.each { app -> 
                        dockerizes["$app"] = {
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && mkdir -p ./dist/apps/$app \""
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH/dist/apps/$app && docker build . -t $REG_URL/$REPO_NAME/$app:$BRANCH-$env.BUILD_NUMBER\" --label=\"repo=$REPO_NAME\" --label=\"branch=$BRANCH\" --label=\"buildNum=$env.BUILD_NUMBER\""
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"docker image tag $REG_URL/$REPO_NAME/$app:$BRANCH-$env.BUILD_NUMBER $REG_URL/$REPO_NAME/$app:$BRANCH-live\""
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"docker push $REG_URL/$REPO_NAME/$app:$BRANCH-live\""
                        }
                    }
                    def totalJobs = dockerizes.size()
                    def totalBranches = totalJobs / maxConcurrentJobs
                    def jobNames = dockerizes.keySet()
                    def jobPlans = dockerizes.values()
                    for (int branch = 0; branch < totalBranches; branch++) {
                        def start = branch * maxConcurrentJobs
                        def end = ((branch + 1) * maxConcurrentJobs < totalJobs ? (branch + 1) * maxConcurrentJobs : totalJobs) - 1
                        def jobs = [:]
                        (start..end).each { index ->
                            jobs[jobNames[index]] = jobPlans[index]
                        }
                        parallel jobs
                    }
                }
            }
        }
        stage("Deploy"){
            steps {
                script {
                    def deploys = [:]
                    def maxConcurrentJobs = 8
                    ALL_PROJECTS.tokenize(",").each { app -> 
                        if((PROJECTS).contains(app)) {
                            deploys[app] = {
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra && helm upgrade app ./app/ -f app/values/_common-values.yaml -f app/values/_common-secret.yaml -f app/values/$app-values.yaml -f app/values/$app-secret.yaml -i --create-namespace -n $app-$BRANCH --kubeconfig master/${app}.yaml\""
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra && kubectl rollout restart deployments/app-deployment -n $app-$BRANCH --kubeconfig master/${app}.yaml\""
                            }
                        } else {
                            deploys[app] = {
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra && kubectl apply -f $BRANCH/${app}.yaml -n $app-$BRANCH --kubeconfig master/${app}.yaml\""
                            }
                        }
                    }
                    def totalJobs = deploys.size()
                    def totalBranches = totalJobs / maxConcurrentJobs
                    def jobNames = deploys.keySet()
                    def jobPlans = deploys.values()
                    for (int branch = 0; branch < totalBranches; branch++) {
                        def start = branch * maxConcurrentJobs
                        def end = ((branch + 1) * maxConcurrentJobs < totalJobs ? (branch + 1) * maxConcurrentJobs : totalJobs) - 1
                        def jobs = [:]
                        (start..end).each { index ->
                            jobs[jobNames[index]] = jobPlans[index]
                        }
                        parallel jobs
                    }
                }
            }
        }
        stage("Cleanup"){
            parallel {
                stage("Clean Master Registry"){
                    steps{
                        sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master/registry && chmod +x cleanup-registry.sh && ./cleanup-registry.sh\""
                    }
                }
                stage("Clean Build Registry"){
                    steps {
                        sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH/infra/master/registry && chmod +x cleanup-agent.sh && ./cleanup-agent.sh $REG_URL/$REPO_NAME $BRANCH $env.BUILD_NUMBER\""
                    }
                }
            }
        }
    }
    post {
        failure {
            sh "echo 'Build Failed - $env.JOB_NAME $env.BUILD_NUMBER'"
            discordSend description: "Build Failed - $env.JOB_NAME $env.BUILD_NUMBER", link: env.BUILD_URL, result: currentBuild.currentResult, title: env.JOB_NAME, webhookURL: env.DISCORD_WEBHOOK
        }
        success {
            script {
                discordSend description: "Build Succeed - $env.JOB_NAME $env.BUILD_NUMBER", link: env.BUILD_URL, result: currentBuild.currentResult, title: env.JOB_NAME, webhookURL: env.DISCORD_WEBHOOK
            }
        }
    }
}
